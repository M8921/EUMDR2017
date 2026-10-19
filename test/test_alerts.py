"""Tests for alerts/collector.py with offline sample feeds.  Run: python -m unittest discover test"""

import json
import sys
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "alerts"))
import collector  # noqa: E402

RSS = b"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>MedWatch Safety Alerts RSS Feed</title>
<item><title>Early Alert: Transcatheter Mitral Valve Delivery System Issue from Edwards Lifesciences</title>
<link>http://www.fda.gov/medical-devices/medical-device-recalls-and-early-alerts/early-alert-x</link>
<pubDate>Thu, 15 Oct 2026 00:00:00 EDT</pubDate><description>Device issue</description></item>
<item><title>Infusion Set Recall: BD Alaris Pump Infusion Sets</title>
<link>http://www.fda.gov/recall-y</link><pubDate>Wed, 14 Oct 2026 00:00:00 EDT</pubDate></item>
<item><title>Old notice</title><link>http://x</link><pubDate>Mon, 01 Jan 2024 00:00:00 EST</pubDate></item>
</channel></rss>"""

ATOM = b"""<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>Alerts</title>
<entry><title>Product defect: contamination of sterile saline ampoules</title>
<link href="https://example.org/a1"/><updated>2026-10-10T09:00:00+10:00</updated>
<summary>Particulate matter found.</summary></entry></feed>"""

OPENFDA = json.dumps({"results": [{
    "recall_number": "Z-0001-2027", "event_id": "99999", "recalling_firm": "Acme Medical",
    "product_description": "Acme infusion pump, model X", "reason_for_recall": "Software error may stop infusion.",
    "classification": "Class I", "status": "Ongoing", "report_date": "20261012", "country": "United States"}]}).encode()

GOVUK = json.dumps({"results": [{
    "title": "Class 2 Medicines Recall: Example tablets 10mg", "link": "/drug-device-alerts/class-2-medicines-recall-example",
    "public_timestamp": "2026-10-08T10:00:00.000+01:00", "description": "Batch recalled due to out of specification results.",
    "alert_type": [{"label": "Medicines recall", "value": "medicines-recall"}]}]}).encode()

HC = json.dumps([
    {"NID": "1", "Title": "Embletta MPR PG", "URL": "https://recalls-rappels.canada.ca/en/alert-recall/embletta-mpr-pg",
     "Organization": "Medical devices", "Product": "Embletta MPR PG", "Issue": "Performance", "What you should do": "",
     "Category": "General hospital and personal use", "Recall class": "Type II", "Last updated": "2026-10-06", "Archived": "0"},
    {"NID": "2", "Title": "Toy car", "URL": "https://x", "Organization": "Consumer products", "Product": "Toy",
     "Issue": "Choking", "Category": "Toys", "Recall class": "", "Last updated": "2026-10-06", "Archived": "0"},
    {"NID": "3", "Title": "Old vaccine notice", "URL": "https://y", "Organization": "Health products - Drugs",
     "Issue": "Quality", "Category": "Vaccine", "Last updated": "2026-10-01", "Archived": "1"},
]).encode()

CONFIG = {"sources": [
    {"id": "rss", "agency": "FDA", "name": "MedWatch", "type": "rss", "url": "rss"},
    {"id": "atom", "agency": "TGA", "name": "Alerts", "type": "rss", "url": "atom"},
    {"id": "ofda", "agency": "FDA", "name": "Device recalls", "type": "openfda", "url": "https://api.fda.gov/device/enforcement.json?search=report_date:[{from}+TO+{to}]", "product": "Medical device", "kind": "Recall"},
    {"id": "gov", "agency": "MHRA", "name": "Alerts", "type": "govuk_search", "url": "gov"},
    {"id": "hc", "agency": "Health Canada", "name": "Recalls", "type": "healthcanada_json", "url": "hc"},
    {"id": "broken", "agency": "PMDA", "name": "Safety", "type": "rss", "url": "broken"},
    {"id": "off", "agency": "X", "name": "Disabled", "type": "rss", "url": "off", "enabled": False},
]}

FEEDS = {"rss": RSS, "atom": ATOM, "gov": GOVUK, "hc": HC}


def fake_fetch(url):
    if url.startswith("https://api.fda.gov"):
        assert "20251019+TO+20261019" in url, url
        return OPENFDA
    if url == "broken":
        raise OSError("connection refused")
    return FEEDS[url]


class CollectorTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.result = collector.collect(CONFIG, fetcher=fake_fetch, today=date(2026, 10, 19))
        cls.by_title = {i["title"]: i for i in cls.result["items"]}

    def test_one_failing_feed_does_not_stop_others(self):
        status = {s["id"]: s for s in self.result["sources"]}
        self.assertFalse(status["broken"]["ok"])
        self.assertIn("connection refused", status["broken"]["error"])
        self.assertTrue(all(status[k]["ok"] for k in ("rss", "atom", "ofda", "gov", "hc")))
        self.assertNotIn("off", status)

    def test_rss_and_atom_dates_and_links(self):
        early = self.by_title["Early Alert: Transcatheter Mitral Valve Delivery System Issue from Edwards Lifesciences"]
        self.assertEqual(early["date"], "2026-10-15")
        self.assertEqual(early["kind"], "Early alert")
        self.assertEqual(early["product"], "Medical device")
        tga = self.by_title["Product defect: contamination of sterile saline ampoules"]
        self.assertEqual((tga["date"], tga["link"]), ("2026-10-10", "https://example.org/a1"))
        self.assertEqual(tga["kind"], "Quality concern")

    def test_items_older_than_window_are_dropped(self):
        self.assertNotIn("Old notice", self.by_title)

    def test_openfda_record(self):
        rec = self.by_title["Acme Medical: Acme infusion pump, model X"]
        self.assertEqual(rec["date"], "2026-10-12")
        self.assertEqual((rec["kind"], rec["product"], rec["classification"]), ("Recall", "Medical device", "Class I"))
        self.assertIn('recall_number:"Z-0001-2027"', rec["link"])

    def test_govuk_record(self):
        rec = self.by_title["Class 2 Medicines Recall: Example tablets 10mg"]
        self.assertEqual(rec["link"], "https://www.gov.uk/drug-device-alerts/class-2-medicines-recall-example")
        self.assertEqual((rec["date"], rec["kind"], rec["product"]), ("2026-10-08", "Recall", "Medicine"))
        self.assertIn("Quality concern", rec["tags"])
        self.assertEqual(rec["alert_type"], "Medicines recall")

    def test_health_canada_keeps_only_current_health_products(self):
        self.assertIn("Embletta MPR PG", self.by_title)
        self.assertEqual(self.by_title["Embletta MPR PG"]["product"], "Medical device")
        self.assertEqual(self.by_title["Embletta MPR PG"]["kind"], "Recall")
        self.assertNotIn("Toy car", self.by_title)
        self.assertNotIn("Old vaccine notice", self.by_title)

    def test_sorted_newest_first(self):
        dates = [i["date"] for i in self.result["items"]]
        self.assertEqual(dates, sorted(dates, reverse=True))

    def test_classification_rules(self):
        self.assertEqual(collector.classify("Import alert: firm banned from exporting")[0], "Ban / suspension")
        self.assertEqual(collector.classify("Urgent field safety notice: software update for ventilator")[0], "Field safety notice")
        self.assertEqual(collector.classify("Revisions of PRECAUTIONS: anamorelin")[0], "Safety communication")
        self.assertEqual(collector.classify("Influenza vaccine shortage")[2], "Biologic / vaccine")

    def test_sources_file_is_valid(self):
        config = json.loads(collector.SOURCES.read_text(encoding="utf-8"))
        for s in config["sources"]:
            self.assertIn(s["type"], collector.PARSERS, s["id"])
            self.assertTrue(s["url"].startswith("https://"), s["id"])


if __name__ == "__main__":
    unittest.main()
