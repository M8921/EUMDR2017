# Review of Classification Engine v3 against EU MDR / IVDR Annex VIII

This review covers the version of `index.html` committed on 10 September 2026 (commit `60a0f75`). Each finding names the Annex VIII provision it conflicts with and how v4 fixes it.

## Blocking

| # | Finding | Fix in v4 |
|---|---------|-----------|
| 1 | `engine.js` and `style.css` are referenced but not in the repository, so the page computes nothing. | Added `engine.js` (rule logic), `app.js` (UI wiring) and `style.css`. |
| 2 | Only 9 of the 22 MDR rules had any input. Rules 1, 2, 3, 9, 10, 12, 13, 15, 16, 17, 20 and 22 were missing. Rules 5–8 had no indent-level inputs. | All 22 rules are covered, each indent separately. |

## MDR 2017/745

| # | Finding | Provision | Fix in v4 |
|---|---------|-----------|-----------|
| 3 | Cumulative use was labelled "Rule 3.7". Accumulated duration is implementing rule 3.6(b). Rule 3.7 defines "direct diagnosis". | Annex VIII 3.6, 3.7 | Relabelled 3.6(b). Rule 3.7 is used in Rule 10. |
| 4 | Cumulative duration was entered in days with no link to the duration categories. | Annex VIII 1.1–1.3, 3.6 | The accumulated duration is entered as a category, and the longer of the two is used. |
| 5 | "Non-invasive" was labelled "body liquids channelling", which mixes Rule 1 with Rule 2. Rule 2's class IIa conditions and the class IIb blood-bag case were missing. | Rule 2 | Added a separate Rule 2 input covering liquids or gases, blood or organs, blood bags, and connection to an active device of class IIa or higher. |
| 6 | Rule 3 was missing: haemodialysers (IIb), filtration or centrifugation (IIa), and IVF media (III). | Rule 3 | Added. |
| 7 | Rule 4 offered one "injured skin" box with no subclasses. The rule has four outcomes and also applies to invasive devices on injured mucous membrane. | Rule 4 | Four-way choice; applied to non-invasive and body-orifice devices. |
| 8 | Rule 5 had no input for "upper cavities only" (oral to pharynx, ear canal to eardrum, nasal cavity), absorption by the mucous membrane, or connection to an active device of class IIa or higher. | Rule 5 | Added. |
| 9 | "Oral cavity / teeth" was a single box. It mixed Rule 5 (oral cavity) with Rule 8 ("placed in the teeth" is IIa). | Rules 5, 8 | Separate inputs. |
| 10 | Rules 6–8 indents were missing: ionising radiation, biological effect or absorption, chemical change, administering medicinal products, active implantables, breast implants and meshes, joint and spinal implants, and the ancillary-component exception. Rule 6 and Rule 7 handle absorption differently (IIb in Rule 6, III in Rule 7). | Rules 6, 7, 8 | Each indent is a separate input, evaluated against the correct duration rule. |
| 11 | "Active device" and "software" shared one checkbox. Rules 9, 10, 12, 13 and 22 had no inputs, so active hardware could not be classified. | Rules 9–13, 22 | Separate sections. Rule 13 applies only when no other active rule does. |
| 12 | Rule 11's "information for decisions" and "monitoring" were one exclusive drop-down. Software can do both, and implementing rule 3.5 then requires the higher class. | Rule 11, rule 3.5 | Two independent inputs. |
| 13 | Rule 22 (closed-loop systems, AEDs → class III) was missing. Note that `MedDeviceGuide` in the project knowledge folder wrongly describes Rule 22 as covering Annex XVI products. | Rule 22 | Added. |
| 14 | Rule 21 listed "ear to eardrum" among the class IIa routes. Rule 21 covers only the skin and the nasal or oral cavity as far as the pharynx. | Rule 21 | Corrected. Ear drops now fall to IIb unless systemically absorbed, in which case they are III. |
| 15 | Rule 19 put "high or medium" exposure in one box, which gave class III. The low (IIb) and negligible (IIa) outcomes were missing. | Rule 19 | Four-level choice. |
| 16 | Rule 18's exception for animal-derived material that contacts only intact skin was missing. | Rule 18 | Added. |
| 17 | Rules 15, 16 and 17 were missing (contraception and STI prevention, disinfectants and contact-lens care, X-ray image recording). | Rules 15–17 | Added. |
| 18 | The Is, Im and Ir qualifiers were shown whatever the final class was. They only apply to class I. | Art. 52(7) | They are shown on the result only when the final class is I. |
| 19 | The conformity route had no source: there was no Art. 54 consultation for implantable class III, no WET exemption for class IIb implantables, and no Annex IX 5.2–5.4 consultations for Rules 14, 18 and 21. | Art. 52, 54; Annex IX | Each route is generated from the class and the rules that triggered it. |
| 20 | The Annex XVI box said nothing about the Common Specifications or the reclassification regulation. | Art. 1(2) | A note now cites Implementing Regulations (EU) 2022/2346 and 2022/2347. |

## IVDR 2017/746

| # | Finding | Provision | Fix in v4 |
|---|---------|-----------|-----------|
| 21 | Rule 3 indent letters were wrong. Cancer is 3(h), not 3(c). Prenatal congenital screening is 3(l), not 3(e). Rule 3(a) covers sexually transmitted agents, not influenza, RSV or SARS-CoV-2. | Rule 3 | All 13 indents, 3(a)–3(m), with their correct text. |
| 22 | The Rule 1 option mixed donor screening, Rule 1(a), with life-threatening agents that have a high risk of propagation, Rule 1(b), such as Ebola and Marburg. The infectious-load indent was missing. | Rule 1 | Three separate indents. |
| 23 | The self-test exception listed "cholesterol/glucose monitoring". The exception covers glucose **in urine** only, so blood glucose self-tests are class C. | Rule 4(a) | Corrected, with a hint. |
| 24 | "Rule 4b" was used for the self-test exception. 4(b) is near-patient testing, which is classified in its own right. | Rule 4 | Relabelled; near-patient testing adds a note only. |
| 25 | "Worst-case analyte governs under Rule 1.7" is the wrong reference. Multiple purposes are 1.8 and multiple rules 1.9. Controls with assigned values follow 1.6, not Rule 7. Calibrators (1.5) were missing. | Implementing rules 1.5–1.9 | Corrected; calibrator product type added. |
| 26 | Rule 6, the class B default, was missing, so an ordinary clinical chemistry test had no class. | Rule 6 | Added as the default. |
| 27 | Class A sterile, the expert panel route for class D, CDx consultation, and SSP and PSUR obligations were missing. | Art. 48, 29, 81 | Added to the conformity output. |

## Out of scope for v4

- The European Commission's December 2025 proposal to revise the MDR and IVDR, discussed in the MedTech Europe paper of 5 May 2026 in the project knowledge folder, is not law yet. The engine follows Annex VIII as currently in force.
- MDCG 2020-16 contains pathogen-specific IVDR examples such as SARS-CoV-2. The engine asks for the purpose, not the pathogen, so the user applies MDCG 2020-16 when choosing the indent.
