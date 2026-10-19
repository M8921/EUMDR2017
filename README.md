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
| `test/engine.test.js` | 101 reference cases based on Annex VIII and the examples in MDCG 2021-24 and MDCG 2020-16. |
| `REVIEW.md` | Flaws found in v3 and how v4 fixes them. |

## Tests

```
node --test
```

## Disclaimer

This is decision support. Under Art. 51 the manufacturer is responsible for classification, and disputes go to the competent authority. Use it together with MDCG 2021-24 (devices), MDCG 2019-11 (software) and MDCG 2020-16 (IVDs).
