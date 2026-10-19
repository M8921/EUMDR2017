# EUMDR2017: EU MDR & IVDR Classification Engine

A browser tool that classifies medical devices under Annex VIII of **EU MDR 2017/745** (Rules 1–22) and in vitro diagnostics under Annex VIII of **EU IVDR 2017/746** (Rules 1–7). For each device it shows:

- the final class, with the Is, Im and Ir qualifiers where they apply
- every rule that applied, its Annex VIII section, and which rule decided the class (implementing rule 3.5 for the MDR, 1.9 for the IVDR)
- the effective duration after cumulative use (rule 3.6)
- Notified Body involvement and the conformity assessment route (MDR Art. 52 and 54, IVDR Art. 48), including Annex IX consultations, SSCP or SSP, and PSUR

## Use

Open `index.html` in a browser. It needs no build step or server and also works on GitHub Pages.

## Files

| File | Purpose |
|------|---------|
| `engine.js` | Classification logic. Pure functions `classifyMDR(profile)` and `classifyIVDR(profile)`; the profile format is documented at the top of the file. Runs in the browser and in Node. |
| `app.js` | Connects the form to the engine. Each input's `data-path` names its field in the profile. |
| `index.html`, `style.css` | The form and the result panel. |
| `test/engine.test.js` | 108 reference cases based on Annex VIII and the examples in MDCG 2021-24 and MDCG 2020-16. |
| `REVIEW.md` | Flaws found in v3 and how v4 fixes them. |
| `server.py` | Local server for both pages, with the alerts refresh endpoint. |
| `alerts.html`, `alerts.js`, `alerts/` | Global alerts tracker: page, feed list (`sources.json`) and collector. |

## Tests

```
node --test
```

## Disclaimer

This is decision support. Under Art. 51 the manufacturer is responsible for classification, and disputes go to the competent authority. Use it together with MDCG 2021-24 (devices), MDCG 2019-11 (software) and MDCG 2020-16 (IVDs).

## Run on localhost

On Windows double-click `start-windows.bat`; on macOS or Linux run `sh start-mac-linux.sh`. Both run `python server.py` (Python 3.8 or later, no packages to install) and open:

- http://localhost:8000/ for the classification engine
- http://localhost:8000/alerts.html for the global alerts tracker

## Global alerts tracker

`alerts.html` lists recalls, field safety notices, early alerts, safety communications, bans and quality concerns from the last 12 months, with filters by regulator, type of notice, product (device, medicine, biologic or vaccine), period and keyword.

| Regulator | Feeds |
|-----------|-------|
| FDA (US) | Device and drug enforcement reports (openFDA), MedWatch safety alerts and device early alerts, CBER biologics updates |
| MHRA (UK) | Drug and device alerts, Drug Safety Update |
| Health Canada | Recalls and safety alerts for medical devices and health products |
| TGA (Australia) | All alerts, safety updates |
| PMDA / MHLW (Japan) | Safety measures |

The EU (MDCG), IMDRF, BfArM, Swissmedic, HPRA, ANSM, HSA, EMA and WHO do not publish a feed that can be read automatically, so the page links to their pages instead.

`server.py` collects the alerts when it starts, if the saved copy is older than 6 hours, and when you press **Refresh from regulators**. You can also run `python alerts/collector.py` on its own. Feeds are configured in `alerts/sources.json`; a feed that fails is shown with its error under Sources and the others still load. Notice types and product types are assigned by keyword, so always read the original notice.

Collector tests: `python -m unittest discover -s test -p "test_*.py"`
