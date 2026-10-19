"""Collects safety alerts, recalls, field safety notices and safety communications
from regulators listed in alerts/sources.json, and writes alerts/alerts.json.

Standard library only. Run:  python alerts/collector.py
Each source is fetched independently; a source that fails is reported in the
output and the others still load.
"""

import json
import re
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from xml.etree import ElementTree as ET

HERE = Path(__file__).resolve().parent
SOURCES = HERE / "sources.json"
OUTPUT = HERE / "alerts.json"
USER_AGENT = "Mozilla/5.0 (EU-Classification-Engine alerts collector)"
TIMEOUT = 40
MAX_AGE_DAYS = 365

# Ordered by priority: the first match becomes the item's main kind.
KIND_RULES = [
    ("Ban / suspension", r"\bban(ned)?\b|suspen|cancell?ation|prohibit|import alert|withdrawn from (the )?market|licen[cs]e revoked"),
    ("Recall", r"recall|removal|\bremoves?\b|withdraw|market action"),
    ("Field safety notice", r"field safety|\bfsn\b|\bfsca\b|correction|corrective action|urgent .*notice|software update"),
    ("Early alert", r"early alert"),
    ("Quality concern", r"contaminat|substandard|falsified|counterfeit|steril(e|ity) (issue|failure|assurance)|\bgmp\b|out of specification|impurit|nitrosamine|defect|particulate|mislabel|quality"),
    ("Safety communication", r"safety (communication|alert|information|update|notice)|risk communication|precautions|drug safety update|dear (healthcare|doctor)|dhpc|warning|medwatch|patient safety alert"),
    ("Shortage", r"shortage|supply disruption|discontinu"),
]

PRODUCT_RULES = [
    ("Biologic / vaccine", r"vaccin|biolog|blood (component|product)|plasma|immunoglobulin|cell therapy|gene therapy|tissue|biosimilar|monoclonal"),
    ("Medical device", r"device|implant|catheter|stent|pump|ventilat|monitor|syringe|needle|ultrasound|software|samd|diagnostic|\bivd\b|test kit|assay|glucose|valve|\blead\b|defibrillat|infusion set|glove|mask|endoscop|prosthe|surgical|x-ray|imaging|scanner|analy[sz]er|wheelchair|dialys|electrode|sensor|insulin pump|cannula|lens|hearing aid"),
    ("Medicine", r"tablet|capsule|injection|oral solution|suspension|\bmg\b|\bmcg\b|drug|medicine|ointment|cream|syrup|vial|ampoule|pharmac|antibiotic|precautions"),
]


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        return resp.read()


def parse_date(value):
    """Return an ISO date (YYYY-MM-DD) from the formats regulators use, or ''."""
    if not value:
        return ""
    value = str(value).strip()
    if re.fullmatch(r"\d{8}", value):  # openFDA
        return f"{value[:4]}-{value[4:6]}-{value[6:]}"
    m = re.match(r"(\d{4}-\d{2}-\d{2})", value)  # ISO / Atom / Health Canada
    if m:
        return m.group(1)
    try:  # RSS (RFC 822)
        return parsedate_to_datetime(value).date().isoformat()
    except (TypeError, ValueError, IndexError):
        return ""


def classify(text, default_kind=None, default_product=None):
    low = text.lower()
    tags = [name for name, pattern in KIND_RULES if re.search(pattern, low)]
    kind = default_kind or (tags[0] if tags else "Other notice")
    if default_kind and default_kind not in tags:
        tags.insert(0, default_kind)
    product = default_product
    if not product:
        product = next((name for name, pattern in PRODUCT_RULES if re.search(pattern, low)), "Unspecified")
    return kind, tags or [kind], product


def item(src, title, date, link, summary="", extra=None, hint=""):
    """hint: extra text used only for labelling (e.g. the regulator's own alert type)."""
    title = re.sub(r"\s+", " ", (title or "")).strip()
    summary = re.sub(r"<[^>]+>", " ", summary or "")
    summary = re.sub(r"\s+", " ", summary).strip()
    kind, tags, product = classify(f"{hint} {title} {summary}", src.get("kind"), src.get("product"))
    out = {
        "agency": src["agency"],
        "country": src.get("country", ""),
        "source": src["id"],
        "title": title,
        "date": parse_date(date),
        "link": link or "",
        "summary": summary[:600],
        "kind": kind,
        "tags": tags,
        "product": product,
    }
    if extra:
        out.update({k: v for k, v in extra.items() if v})
    return out


def local(tag):
    return tag.rsplit("}", 1)[-1]


def child_text(el, *names):
    for c in el:
        if local(c.tag) in names:
            if local(c.tag) == "link" and c.get("href"):
                return c.get("href")
            if c.text and c.text.strip():
                return c.text.strip()
    return ""


def parse_rss(src, data):
    root = ET.fromstring(data)
    entries = [e for e in root.iter() if local(e.tag) in ("item", "entry")]
    return [
        item(
            src,
            child_text(e, "title"),
            child_text(e, "pubDate", "updated", "published", "date"),
            child_text(e, "link", "guid", "id"),
            child_text(e, "description", "summary", "content"),
        )
        for e in entries
    ]


def parse_openfda(src, data):
    results = json.loads(data).get("results", [])
    out = []
    for r in results:
        product = r.get("product_description", "")
        reason = r.get("reason_for_recall", "")
        firm = r.get("recalling_firm", "")
        title = f"{firm}: {product[:160]}" if firm else product[:200]
        number = r.get("recall_number", "")
        # openFDA has no web page per recall, so link to the record itself.
        link = f'{src["url"].split("?")[0]}?search=recall_number:"{number}"' if number else ""
        out.append(
            item(
                src,
                title,
                r.get("report_date") or r.get("recall_initiation_date"),
                link,
                reason,
                {
                    "classification": r.get("classification", ""),
                    "status": r.get("status", ""),
                    "reference": number,
                    "firm": firm,
                    "firm_country": r.get("country", ""),
                },
            )
        )
    return out


def parse_govuk(src, data):
    out = []
    for r in json.loads(data).get("results", []):
        link = r.get("link", "")
        if link.startswith("/"):
            link = "https://www.gov.uk" + link
        alert_type = r.get("alert_type")
        if isinstance(alert_type, list):
            alert_type = ", ".join(a.get("label", str(a)) if isinstance(a, dict) else str(a) for a in alert_type)
        out.append(item(src, r.get("title"), r.get("public_timestamp"), link, r.get("description", ""), {"alert_type": alert_type or ""}, hint=alert_type or ""))
    return out


HC_HEALTH = re.compile(r"medical device|health product|drug|natural health|biolog|vaccin", re.I)


def parse_healthcanada(src, data):
    records = json.loads(data)
    if isinstance(records, dict):
        records = next((v for v in records.values() if isinstance(v, list)), [])
    out = []
    for r in records:
        org = r.get("Organization", "")
        if not HC_HEALTH.search(org) or str(r.get("Archived", "0")) == "1":
            continue
        # Medical devices are labelled by the organisation; for other health products
        # the keywords decide between medicine and biologic.
        overrides = {"product": "Medical device"} if re.search(r"medical device", org, re.I) else {}
        # Every record is a recall or an alert; a recall class marks a recall.
        overrides["kind"] = "Recall" if r.get("Recall class") else "Safety communication"
        summary = " \u00b7 ".join(
            f"{label}: {r[key]}" for key, label in (("Issue", "Issue"), ("Category", "Category"), ("What you should do", "What to do")) if r.get(key)
        )
        out.append(
            item(
                dict(src, **overrides),
                r.get("Title") or r.get("Product"),
                r.get("Last updated"),
                r.get("URL"),
                summary,
                {"classification": r.get("Recall class", ""), "category": r.get("Category", "")},
            )
        )
    return out


PARSERS = {
    "rss": parse_rss,
    "openfda": parse_openfda,
    "govuk_search": parse_govuk,
    "healthcanada_json": parse_healthcanada,
}


def collect(config, fetcher=fetch, today=None):
    today = today or datetime.now(timezone.utc).date()
    start = today - timedelta(days=MAX_AGE_DAYS)
    items, status = [], []
    for src in config["sources"]:
        if not src.get("enabled", True):
            continue
        url = src["url"].replace("{from}", start.strftime("%Y%m%d")).replace("{to}", today.strftime("%Y%m%d"))
        try:
            found = PARSERS[src["type"]](src, fetcher(url))
            found = [i for i in found if not i["date"] or i["date"] >= start.isoformat()]
            items.extend(found)
            status.append({"id": src["id"], "agency": src["agency"], "name": src["name"], "ok": True, "count": len(found)})
        except Exception as exc:  # one broken feed must not stop the rest
            status.append({"id": src["id"], "agency": src["agency"], "name": src["name"], "ok": False, "count": 0, "error": f"{type(exc).__name__}: {exc}"[:300]})
    seen, unique = set(), []
    for i in sorted(items, key=lambda x: x["date"], reverse=True):
        key = (i["agency"], i["title"].lower(), i["date"])
        if key not in seen:
            seen.add(key)
            unique.append(i)
    return {
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "window_days": MAX_AGE_DAYS,
        "sources": status,
        "watch_list": config.get("watch_list", []),
        "items": unique,
    }


def main():
    config = json.loads(SOURCES.read_text(encoding="utf-8"))
    result = collect(config)
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    for s in result["sources"]:
        mark = "ok  " if s["ok"] else "FAIL"
        print(f"{mark} {s['agency']:<14} {s['count']:>4}  {s['name']}" + ("" if s["ok"] else f"  ({s['error']})"))
    print(f"\n{len(result['items'])} alerts written to {OUTPUT}")
    return 0 if any(s["ok"] for s in result["sources"]) else 1


if __name__ == "__main__":
    sys.exit(main())
