/*
 * EU MDR 2017/745 & IVDR 2017/746 classification engine.
 *
 * Pure functions, no DOM access: the same file runs in the browser
 * (window.ClassificationEngine) and in Node (require('./engine.js')).
 *
 * classifyMDR(profile)  -> Annex VIII of Regulation (EU) 2017/745, Rules 1-22
 * classifyIVDR(profile) -> Annex VIII of Regulation (EU) 2017/746, Rules 1-7
 *
 * Every rule that applies is recorded with its Annex VIII citation. The final
 * class is the highest one (MDR implementing rule 3.5, IVDR implementing
 * rule 1.9), unless a rule says the device takes the class of another device
 * (MDR 3.3, IVDR 1.4-1.6).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ClassificationEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Shared helpers
  // ---------------------------------------------------------------------------

  const MDR_ORDER = ['I', 'IIa', 'IIb', 'III'];
  const IVDR_ORDER = ['A', 'B', 'C', 'D'];
  const DURATION_ORDER = ['transient', 'short', 'long'];

  function rank(order, cls) {
    return order.indexOf(cls);
  }

  function highest(order, classes) {
    return classes.reduce((best, c) => (rank(order, c) > rank(order, best) ? c : best), order[0]);
  }

  function longerDuration(a, b) {
    return DURATION_ORDER.indexOf(a) >= DURATION_ORDER.indexOf(b) ? a : b;
  }

  // A rule result: one Annex VIII rule (or implementing rule) that applied.
  function hit(rule, cls, reason, ref) {
    return { rule, class: cls, reason, ref };
  }

  // ---------------------------------------------------------------------------
  // MDR 2017/745
  // ---------------------------------------------------------------------------

  /*
   * MDR device profile (all fields optional; omitted means "no" / "none"):
   *
   * qualification: { pim: bool, noMedicalPurpose: bool, annexXVI: bool, accessory: bool }
   * invasiveness:  'non_invasive' | 'orifice' | 'surgical' | 'implantable'
   * duration:      'transient' | 'short' | 'long'          (Annex VIII 1.1-1.3)
   * replacedImmediately: bool, accumulatedDuration: same as duration (3.6(b))
   *
   * nonInvasive:   { channelStore: 'none'|'other'|'blood_liquids_organs'|'blood_bag',
   *                  connectsToActiveIIaPlus: bool,                       Rule 2
   *                  modifiesComposition: 'none'|'physical'|'other',     Rule 3
   *                  inVitroSubstanceForCellsOrEmbryos: bool }           Rule 3
   * injuredSkin:   'none'|'barrier'|'breached_dermis'|'micro_environment'|'other'   Rule 4
   * orifice:       { upperCavitiesOnly: bool, absorbedByMucosa: bool,
   *                  connectsToActiveIIaPlus: bool,                       Rule 5
   *                  inhalation: 'none'|'standard'|'essential_or_life_threatening' }  Rule 20
   * surgical:      { heartCirculatoryDefect, directContactHeartCirculatoryCNS, reusableInstrument,
   *                  ionisingRadiation, biologicalEffectOrAbsorbed, chemicalChange,
   *                  administersMedicinal, administersMedicinalHazardous, placedInTeeth,
   *                  activeImplantable, breastImplantOrMesh, jointReplacement,
   *                  spinalContact, ancillaryComponent }                  Rules 6-8
   * active:        { isActive, therapeuticEnergy, therapeuticEnergyHazardous,
   *                  controlsActiveTherapeuticIIb, therapeuticIonising, controlsActiveImplantable,  Rule 9
   *                  diagnosticEnergyAbsorbed, illuminatesVisibleOnly, radiopharmaceuticalImaging,
   *                  directDiagnosisVital, vitalImmediateDanger, diagnosticIonisingRadiology,      Rule 10
   *                  administersSubstances, administersSubstancesHazardous,                         Rule 12
   *                  closedLoop }                                                                   Rule 22
   * software:      { isSoftware, decisions: 'none'|'other'|'serious'|'death_irreversible',
   *                  monitoring: 'none'|'physiological'|'vital_immediate_danger',                   Rule 11
   *                  drivesDeviceClass: 'I'|'IIa'|'IIb'|'III'|null }                                3.3
   * special:       { medicinalAncillary,                                   Rule 14
   *                  contraceptionOrSTI,                                   Rule 15
   *                  disinfection: 'none'|'contact_lens'|'medical_devices'|'invasive_end_point',  Rule 16
   *                  xrayImageRecording,                                   Rule 17
   *                  tissues: 'none'|'human'|'animal'|'animal_intact_skin',                         Rule 18
   *                  nanomaterial: 'none'|'negligible'|'low'|'medium'|'high',                      Rule 19
   *                  substance: { isSubstance, route: 'skin'|'nasal_oral'|'gi'|'other', systemicAbsorption } }  Rule 21
   * classIFlags:   { sterile, measuring }      (Art. 52(7))
   */
  function classifyMDR(p) {
    p = p || {};
    const q = p.qualification || {};
    const notes = [];

    // --- Qualification (Art. 1 and Art. 2(1)) ---
    if (q.pim) {
      return outOfScopeMDR(
        'Principal intended action is pharmacological, immunological or metabolic. This is a medicinal product, not a medical device (Art. 2(1)). ' +
          'If it forms a single integral product with a device, the device part must meet GSPR (Art. 1(8), 1(9)).'
      );
    }
    if ((q.medicalPurpose === false || q.noMedicalPurpose) && !q.annexXVI) {
      return outOfScopeMDR('No medical purpose under Art. 2(1) and not an Annex XVI product, so it is outside the scope of the MDR.');
    }
    if (q.annexXVI) {
      notes.push(
        'Annex XVI product without a medical purpose (Art. 1(2)): classified with the same Annex VIII rules, and must also meet the Common Specifications in Implementing Regulation (EU) 2022/2346. ' +
          'Check Implementing Regulation (EU) 2022/2347, which reclassifies some active Annex XVI products.'
      );
    }
    if (q.accessory) {
      notes.push('Accessory: classified in its own right, separately from the device it is used with (implementing rule 3.2).');
    }

    const hits = [];
    const inv = p.invasiveness || 'non_invasive';
    const ni = p.nonInvasive || {};
    const orf = p.orifice || {};
    const s = p.surgical || {};
    const a = p.active || {};
    const sw = p.software || {};
    const sp = p.special || {};

    // --- Duration (implementing rule 3.6) ---
    let duration = p.duration || 'transient';
    if (p.replacedImmediately && p.accumulatedDuration) {
      const accumulated = longerDuration(duration, p.accumulatedDuration);
      if (accumulated !== duration) {
        notes.push(
          `Duration taken as ${durationLabel(accumulated)} instead of ${durationLabel(duration)}: the device is replaced immediately by one of the same type, so use is accumulated (implementing rule 3.6(b)).`
        );
      }
      duration = accumulated;
    }

    // --- Non-invasive devices: Rules 1-4 ---
    if (inv === 'non_invasive') {
      hits.push(hit('Rule 1', 'I', 'Non-invasive device; no other rule applies by default.', 'Annex VIII 4.1'));

      if (ni.channelStore && ni.channelStore !== 'none') {
        if (ni.channelStore === 'blood_bag') {
          hits.push(hit('Rule 2', 'IIb', 'Blood bag.', 'Annex VIII 4.2'));
        } else if (ni.channelStore === 'blood_liquids_organs') {
          hits.push(hit('Rule 2', 'IIa', 'Channels or stores blood or other body liquids, or stores organs, parts of organs, cells or tissues.', 'Annex VIII 4.2'));
        } else if (ni.connectsToActiveIIaPlus) {
          hits.push(hit('Rule 2', 'IIa', 'Channels or stores liquids or gases for administration and may be connected to a class IIa, IIb or III active device.', 'Annex VIII 4.2'));
        } else {
          hits.push(hit('Rule 2', 'I', 'Channels or stores liquids or gases for administration; none of the class IIa conditions apply.', 'Annex VIII 4.2'));
        }
      }

      if (ni.modifiesComposition === 'physical') {
        hits.push(hit('Rule 3', 'IIa', 'Modifies the composition of blood, body liquids or other liquids for implantation or administration only by filtration, centrifugation or exchange of gas or heat.', 'Annex VIII 4.3'));
      } else if (ni.modifiesComposition === 'other') {
        hits.push(hit('Rule 3', 'IIb', 'Modifies the biological or chemical composition of tissues, cells, blood, body liquids or other liquids for implantation or administration.', 'Annex VIII 4.3'));
      }
      if (ni.inVitroSubstanceForCellsOrEmbryos) {
        hits.push(hit('Rule 3', 'III', 'Substance or mixture used in vitro in direct contact with human cells, tissues or organs, or with embryos, before their implantation or administration.', 'Annex VIII 4.3'));
      }
    }

    // Rule 4: non-invasive devices on injured skin or mucous membrane; also invasive
    // devices in contact with injured mucous membrane (last paragraph of Rule 4).
    if ((inv === 'non_invasive' || inv === 'orifice') && p.injuredSkin && p.injuredSkin !== 'none') {
      const r4 = {
        barrier: ['I', 'Mechanical barrier, compression or absorption of exudates.'],
        breached_dermis: ['IIb', 'Principally for injuries that have breached the dermis or mucous membrane and can heal only by secondary intent.'],
        micro_environment: ['IIa', 'Principally intended to manage the micro-environment of injured skin or mucous membrane.'],
        other: ['IIa', 'Contact with injured skin or mucous membrane; other purposes.'],
      }[p.injuredSkin];
      if (r4) hits.push(hit('Rule 4', r4[0], r4[1], 'Annex VIII 4.4'));
    }

    // --- Invasive via body orifice: Rule 5 and Rule 20 ---
    if (inv === 'orifice') {
      if (orf.connectsToActiveIIaPlus) {
        hits.push(hit('Rule 5', 'IIa', 'Invasive with respect to a body orifice and intended for connection to a class IIa, IIb or III active device.', 'Annex VIII 5.1'));
      } else if (duration === 'transient') {
        hits.push(hit('Rule 5', 'I', 'Invasive via body orifice, transient use.', 'Annex VIII 5.1'));
      } else if (duration === 'short') {
        if (orf.upperCavitiesOnly) {
          hits.push(hit('Rule 5', 'I', 'Short-term use in the oral cavity as far as the pharynx, the ear canal up to the eardrum, or the nasal cavity.', 'Annex VIII 5.1'));
        } else {
          hits.push(hit('Rule 5', 'IIa', 'Invasive via body orifice, short-term use.', 'Annex VIII 5.1'));
        }
      } else if (orf.upperCavitiesOnly && !orf.absorbedByMucosa) {
        hits.push(hit('Rule 5', 'IIa', 'Long-term use in the oral cavity as far as the pharynx, the ear canal up to the eardrum, or the nasal cavity, and not liable to be absorbed by the mucous membrane.', 'Annex VIII 5.1'));
      } else {
        hits.push(hit('Rule 5', 'IIb', 'Invasive via body orifice, long-term use.', 'Annex VIII 5.1'));
      }

      if (orf.inhalation === 'standard') {
        hits.push(hit('Rule 20', 'IIa', 'Administers medicinal products by inhalation.', 'Annex VIII 7.8'));
      } else if (orf.inhalation === 'essential_or_life_threatening') {
        hits.push(hit('Rule 20', 'IIb', 'Inhalation device whose mode of action has an essential impact on the efficacy and safety of the medicinal product, or that treats life-threatening conditions.', 'Annex VIII 7.8'));
      }
    }

    // --- Surgically invasive and implantable: Rules 6, 7, 8 ---
    const isRule8 = inv === 'implantable' || (inv === 'surgical' && duration === 'long');
    if (inv === 'surgical' && duration === 'transient') {
      let base = 'IIa';
      let reason = 'Surgically invasive device for transient use.';
      if (s.reusableInstrument) {
        base = 'I';
        reason = 'Reusable surgical instrument (class Ir).';
      }
      hits.push(hit('Rule 6', base, reason, 'Annex VIII 5.2'));
      if (s.heartCirculatoryDefect) hits.push(hit('Rule 6', 'III', 'Controls, diagnoses, monitors or corrects a defect of the heart or central circulatory system through direct contact.', 'Annex VIII 5.2'));
      if (s.directContactHeartCirculatoryCNS) hits.push(hit('Rule 6', 'III', 'Specifically for direct contact with the heart, central circulatory system or central nervous system.', 'Annex VIII 5.2'));
      if (s.ionisingRadiation) hits.push(hit('Rule 6', 'IIb', 'Supplies energy in the form of ionising radiation.', 'Annex VIII 5.2'));
      if (s.biologicalEffectOrAbsorbed) hits.push(hit('Rule 6', 'IIb', 'Has a biological effect or is wholly or mainly absorbed.', 'Annex VIII 5.2'));
      if (s.administersMedicinalHazardous) hits.push(hit('Rule 6', 'IIb', 'Administers medicinal products by a delivery system in a potentially hazardous manner.', 'Annex VIII 5.2'));
    } else if (inv === 'surgical' && duration === 'short') {
      hits.push(hit('Rule 7', 'IIa', 'Surgically invasive device for short-term use.', 'Annex VIII 5.3'));
      if (s.heartCirculatoryDefect) hits.push(hit('Rule 7', 'III', 'Controls, diagnoses, monitors or corrects a defect of the heart or central circulatory system through direct contact.', 'Annex VIII 5.3'));
      if (s.directContactHeartCirculatoryCNS) hits.push(hit('Rule 7', 'III', 'Specifically for direct contact with the heart, central circulatory system or central nervous system.', 'Annex VIII 5.3'));
      if (s.ionisingRadiation) hits.push(hit('Rule 7', 'IIb', 'Supplies energy in the form of ionising radiation.', 'Annex VIII 5.3'));
      if (s.biologicalEffectOrAbsorbed) hits.push(hit('Rule 7', 'III', 'Has a biological effect or is wholly or mainly absorbed.', 'Annex VIII 5.3'));
      if (s.chemicalChange && !s.placedInTeeth) hits.push(hit('Rule 7', 'IIb', 'Undergoes chemical change in the body (not placed in the teeth).', 'Annex VIII 5.3'));
      if (s.administersMedicinal || s.administersMedicinalHazardous) hits.push(hit('Rule 7', 'IIb', 'Administers medicinal products.', 'Annex VIII 5.3'));
    } else if (isRule8) {
      let base = 'IIb';
      let reason = inv === 'implantable' ? 'Implantable device.' : 'Surgically invasive device for long-term use.';
      if (s.placedInTeeth) {
        base = 'IIa';
        reason = 'Placed in the teeth.';
      }
      hits.push(hit('Rule 8', base, reason, 'Annex VIII 5.4'));
      if (s.directContactHeartCirculatoryCNS || s.heartCirculatoryDefect) hits.push(hit('Rule 8', 'III', 'Used in direct contact with the heart, central circulatory system or central nervous system.', 'Annex VIII 5.4'));
      if (s.biologicalEffectOrAbsorbed) hits.push(hit('Rule 8', 'III', 'Has a biological effect or is wholly or mainly absorbed.', 'Annex VIII 5.4'));
      if (s.chemicalChange && !s.placedInTeeth) hits.push(hit('Rule 8', 'III', 'Undergoes chemical change in the body (not placed in the teeth).', 'Annex VIII 5.4'));
      if (s.administersMedicinal || s.administersMedicinalHazardous) hits.push(hit('Rule 8', 'III', 'Administers medicinal products.', 'Annex VIII 5.4'));
      if (s.activeImplantable) hits.push(hit('Rule 8', 'III', 'Active implantable device or its accessory.', 'Annex VIII 5.4'));
      if (s.breastImplantOrMesh) hits.push(hit('Rule 8', 'III', 'Breast implant or surgical mesh.', 'Annex VIII 5.4'));
      if (s.jointReplacement && !s.ancillaryComponent) hits.push(hit('Rule 8', 'III', 'Total or partial joint replacement.', 'Annex VIII 5.4'));
      if (s.spinalContact && !s.ancillaryComponent) hits.push(hit('Rule 8', 'III', 'Spinal disc replacement implant, or implantable device in contact with the spinal column.', 'Annex VIII 5.4'));
      if ((s.jointReplacement || s.spinalContact) && s.ancillaryComponent) {
        notes.push('Ancillary component (screw, wedge, plate or instrument) of a joint replacement or spinal implant: excluded from the class III indents of Rule 8.');
      }
    }

    // --- Active devices: Rules 9, 10, 12, 13, 22 ---
    if (a.isActive || sw.isSoftware) {
      if (a.therapeuticEnergy) {
        hits.push(
          a.therapeuticEnergyHazardous
            ? hit('Rule 9', 'IIb', 'Active therapeutic device that administers or exchanges energy in a potentially hazardous way (nature, density and site of application).', 'Annex VIII 6.2')
            : hit('Rule 9', 'IIa', 'Active therapeutic device that administers or exchanges energy.', 'Annex VIII 6.2')
        );
      }
      if (a.controlsActiveTherapeuticIIb) hits.push(hit('Rule 9', 'IIb', 'Controls, monitors or directly influences the performance of a class IIb active therapeutic device.', 'Annex VIII 6.2'));
      if (a.therapeuticIonising) hits.push(hit('Rule 9', 'IIb', 'Emits ionising radiation for therapeutic purposes, or controls, monitors or directly influences such devices.', 'Annex VIII 6.2'));
      if (a.controlsActiveImplantable) hits.push(hit('Rule 9', 'III', 'Controls, monitors or directly influences the performance of an active implantable device.', 'Annex VIII 6.2'));

      if (a.diagnosticEnergyAbsorbed) {
        hits.push(
          a.illuminatesVisibleOnly
            ? hit('Rule 10', 'I', 'Only illuminates the patient’s body in the visible spectrum.', 'Annex VIII 6.3')
            : hit('Rule 10', 'IIa', 'Active diagnostic device that supplies energy absorbed by the body.', 'Annex VIII 6.3')
        );
      }
      if (a.radiopharmaceuticalImaging) hits.push(hit('Rule 10', 'IIa', 'Images the in vivo distribution of radiopharmaceuticals.', 'Annex VIII 6.3'));
      if (a.directDiagnosisVital) {
        hits.push(
          a.vitalImmediateDanger
            ? hit('Rule 10', 'IIb', 'Monitors vital physiological parameters where variations could result in immediate danger, or diagnoses in clinical situations where the patient is in immediate danger.', 'Annex VIII 6.3')
            : hit('Rule 10', 'IIa', 'Allows direct diagnosis or monitoring of vital physiological processes (implementing rule 3.7).', 'Annex VIII 6.3')
        );
      }
      if (a.diagnosticIonisingRadiology) hits.push(hit('Rule 10', 'IIb', 'Emits ionising radiation for diagnostic or interventional radiology, or controls, monitors or directly influences such devices.', 'Annex VIII 6.3'));

      if (a.administersSubstances) {
        hits.push(
          a.administersSubstancesHazardous
            ? hit('Rule 12', 'IIb', 'Administers or removes medicinal products, body liquids or other substances in a potentially hazardous manner.', 'Annex VIII 6.5')
            : hit('Rule 12', 'IIa', 'Administers or removes medicinal products, body liquids or other substances.', 'Annex VIII 6.5')
        );
      }

      if (a.closedLoop) hits.push(hit('Rule 22', 'III', 'Active therapeutic device with an integrated diagnostic function that significantly determines patient management (e.g. closed-loop system, automated external defibrillator).', 'Annex VIII 7.10'));

      const activeRuleApplied = hits.some((h) => ['Rule 9', 'Rule 10', 'Rule 12', 'Rule 22'].includes(h.rule));
      if (a.isActive && !activeRuleApplied && !sw.isSoftware) {
        hits.push(hit('Rule 13', 'I', 'Active device not covered by Rules 9, 10, 11, 12 or 22.', 'Annex VIII 6.6'));
      }
    }

    // --- Software: Rule 11 and implementing rule 3.3 ---
    let drivenClass = null;
    if (sw.isSoftware) {
      if (sw.drivesDeviceClass) {
        drivenClass = sw.drivesDeviceClass;
        hits.push(hit('Rule 3.3', drivenClass, 'Software drives or influences the use of a device, so it falls within the same class as that device.', 'Annex VIII 3.3'));
      }
      const decision = {
        other: ['IIa', 'Provides information used to take decisions with diagnostic or therapeutic purposes.'],
        serious: ['IIb', 'Those decisions may cause a serious deterioration of health or a surgical intervention.'],
        death_irreversible: ['III', 'Those decisions may cause death or an irreversible deterioration of health.'],
      }[sw.decisions];
      if (decision) hits.push(hit('Rule 11', decision[0], decision[1], 'Annex VIII 6.4'));
      if (sw.monitoring === 'physiological') hits.push(hit('Rule 11', 'IIa', 'Monitors physiological processes.', 'Annex VIII 6.4'));
      if (sw.monitoring === 'vital_immediate_danger') hits.push(hit('Rule 11', 'IIb', 'Monitors vital physiological parameters where variations could result in immediate danger.', 'Annex VIII 6.4'));
      if (!decision && (!sw.monitoring || sw.monitoring === 'none')) {
        hits.push(hit('Rule 11', 'I', 'All other software.', 'Annex VIII 6.4'));
      }
      notes.push('Software: see MDCG 2019-11 rev.1 for qualification and classification. Standalone software is classified in its own right (implementing rule 3.3).');
    }

    // --- Special rules 14-21 ---
    if (sp.medicinalAncillary) hits.push(hit('Rule 14', 'III', 'Incorporates, as an integral part, a substance that would be a medicinal product if used separately (including one derived from human blood or plasma), with an action ancillary to the device.', 'Annex VIII 7.1'));

    if (sp.contraceptionOrSTI) {
      const longInvasive = inv === 'implantable' || (inv !== 'non_invasive' && duration === 'long');
      hits.push(
        longInvasive
          ? hit('Rule 15', 'III', 'Contraception or STD prevention device that is implantable or long-term invasive.', 'Annex VIII 7.2')
          : hit('Rule 15', 'IIb', 'Used for contraception or to prevent the transmission of sexually transmitted diseases.', 'Annex VIII 7.2')
      );
    }

    const r16 = {
      contact_lens: ['IIb', 'Specifically for disinfecting, cleaning, rinsing or hydrating contact lenses.'],
      medical_devices: ['IIa', 'Specifically for disinfecting or sterilising medical devices.'],
      invasive_end_point: ['IIb', 'Disinfecting solution or washer-disinfector specifically for disinfecting invasive devices as the end point of processing.'],
    }[sp.disinfection];
    if (r16) hits.push(hit('Rule 16', r16[0], r16[1], 'Annex VIII 7.3'));

    if (sp.xrayImageRecording) hits.push(hit('Rule 17', 'IIa', 'Specifically intended to record diagnostic images generated by X-ray radiation.', 'Annex VIII 7.4'));

    if (sp.tissues === 'human' || sp.tissues === 'animal') {
      hits.push(hit('Rule 18', 'III', `Manufactured using non-viable tissues or cells of ${sp.tissues} origin, or their derivatives.`, 'Annex VIII 7.5'));
    } else if (sp.tissues === 'animal_intact_skin') {
      // The exception only holds for devices that touch intact skin and nothing else.
      if (inv === 'non_invasive' && (!p.injuredSkin || p.injuredSkin === 'none')) {
        notes.push('Rule 18 exception: non-viable animal tissue or derivatives that only contact intact skin, so Rule 18 does not raise the class.');
      } else {
        hits.push(hit('Rule 18', 'III', 'Non-viable animal tissue or derivatives. The intact-skin exception does not apply, because the device is invasive or contacts injured skin or mucous membrane.', 'Annex VIII 7.5'));
      }
    }

    const r19 = { high: 'III', medium: 'III', low: 'IIb', negligible: 'IIa' }[sp.nanomaterial];
    if (r19) hits.push(hit('Rule 19', r19, `Incorporates or consists of nanomaterial with ${sp.nanomaterial} potential for internal exposure.`, 'Annex VIII 7.6'));

    const sub = sp.substance || {};
    if (sub.isSubstance) {
      if (sub.systemicAbsorption) {
        hits.push(
          sub.route === 'gi'
            ? hit('Rule 21', 'III', 'Achieves its purpose in the stomach or lower gastrointestinal tract, and it or its metabolites are systemically absorbed.', 'Annex VIII 7.9')
            : hit('Rule 21', 'III', 'It or its products of metabolism are systemically absorbed in order to achieve the intended purpose.', 'Annex VIII 7.9')
        );
      } else if (sub.route === 'skin' || sub.route === 'nasal_oral') {
        hits.push(hit('Rule 21', 'IIa', 'Applied on the skin, or in the nasal or oral cavity as far as the pharynx, and achieves its purpose there.', 'Annex VIII 7.9'));
      } else {
        hits.push(hit('Rule 21', 'IIb', 'Substance-based device; all other cases.', 'Annex VIII 7.9'));
      }
    }

    if (hits.length === 0) {
      // Non-active invasive device with nothing else selected cannot happen; this is a safety net.
      hits.push(hit('Rule 1', 'I', 'No rule matched the profile; defaulting to Rule 1.', 'Annex VIII 4.1'));
    }

    // --- Implementing rule 3.5: strictest rule, highest class ---
    const finalClass = highest(MDR_ORDER, hits.map((h) => h.class));
    const decisive = hits.filter((h) => h.class === finalClass);

    const flags = p.classIFlags || {};
    const subClasses = [];
    if (finalClass === 'I') {
      if (flags.sterile) subClasses.push('Is');
      if (flags.measuring) subClasses.push('Im');
      if (s.reusableInstrument && inv === 'surgical') subClasses.push('Ir');
    }

    const implantable = inv === 'implantable';
    const ruleNumbers = (n) => hits.some((h) => h.rule === n);
    const conformity = mdrConformity(finalClass, {
      subClasses,
      implantable,
      wetExempt: s.ancillaryComponent || s.placedInTeeth,
      rule12IIb: hits.some((h) => h.rule === 'Rule 12' && h.class === 'IIb'),
      rule14: ruleNumbers('Rule 14'),
      rule18Human: sp.tissues === 'human',
      rule21Systemic: !!(sub.isSubstance && sub.systemicAbsorption),
    });

    return {
      framework: 'EU MDR 2017/745',
      inScope: true,
      class: finalClass,
      label: 'Class ' + finalClass + (subClasses.length ? ' (' + subClasses.join(', ') + ')' : ''),
      effectiveDuration: duration,
      hits,
      decisive,
      notes,
      ...conformity,
    };
  }

  function outOfScopeMDR(reason) {
    return {
      framework: 'EU MDR 2017/745',
      inScope: false,
      class: null,
      label: 'Not a medical device',
      hits: [],
      decisive: [],
      notes: [reason],
      notifiedBody: 'Not applicable',
      route: [],
    };
  }

  function durationLabel(d) {
    return { transient: 'transient (< 60 min)', short: 'short-term (60 min to 30 days)', long: 'long-term (> 30 days)' }[d];
  }

  function mdrConformity(cls, o) {
    const route = [];
    let notifiedBody;
    if (cls === 'I') {
      if (o.subClasses.length) {
        notifiedBody = 'Required, limited to the ' + o.subClasses.map((c) => ({ Is: 'sterility', Im: 'metrology', Ir: 'reuse' })[c]).join(', ') + ' aspects';
        route.push('EU declaration of conformity on the basis of Annex II and III technical documentation (Art. 52(7)).');
        route.push('Notified Body involvement limited to those aspects, via Annex IX Chapters I and III, or Annex XI Part A (Art. 52(7)(a)-(c)).');
      } else {
        notifiedBody = 'Not required (self-declaration)';
        route.push('Manufacturer draws up Annex II and III technical documentation and issues the EU declaration of conformity (Art. 52(7)).');
      }
    } else if (cls === 'IIa') {
      notifiedBody = 'Required';
      route.push('Annex IX Chapters I and III (full QMS), with technical documentation assessed for at least one representative device per category of devices (Art. 52(6)).');
      route.push('Or: Annex II and III technical documentation with Annex XI Section 10 (production quality assurance) or Section 18 (product verification).');
    } else if (cls === 'IIb') {
      notifiedBody = 'Required';
      if (o.implantable && !o.wetExempt) {
        route.push('Annex IX Chapters I and III, with the technical documentation of every implantable class IIb device assessed under Annex IX Section 4 (Art. 52(4)).');
      } else {
        route.push('Annex IX Chapters I and III, with technical documentation assessed for at least one representative device per generic device group (Art. 52(4)).');
        if (o.implantable && o.wetExempt) {
          route.push('Well-established technology exemption in Art. 52(4) may apply (sutures, staples, dental fillings, braces, tooth crowns, screws, wedges, plates, wires, pins, clips, connectors).');
        }
      }
      route.push('Or: Annex X (EU type-examination) with Annex XI (product conformity verification).');
      if (o.rule12IIb) route.push('Class IIb active device that administers or removes a medicinal product: clinical evaluation consultation procedure with an expert panel (Art. 54, Annex IX Section 5.1).');
    } else {
      notifiedBody = 'Required';
      route.push('Annex IX Chapters I, II and III (full QMS and assessment of technical documentation), or Annex X (EU type-examination) with Annex XI (product conformity verification) (Art. 52(3)).');
      if (o.implantable) route.push('Implantable class III device: clinical evaluation consultation procedure with an expert panel (Art. 54, Annex IX Section 5.1).');
    }
    if (cls === 'III' || o.implantable) {
      route.push('Clinical investigation required for implantable and class III devices unless an Art. 61(4)-(6) exemption applies (e.g. sutures, staples, dental fillings, screws, plates under Art. 61(6)(b)).');
    }
    if ((cls === 'III' && o.implantable) || o.rule12IIb) {
      route.push('Art. 54(2) lists the cases where this consultation is not required, such as certain modifications of a certified device or compliance with Common Specifications.');
    }
    if (o.rule14) route.push('Rule 14: Notified Body must consult a medicines authority or the EMA on the ancillary medicinal substance (Annex IX Section 5.2).');
    if (o.rule18Human) route.push('Rule 18 (human tissue): consult a competent authority for human tissues and cells (Annex IX Section 5.3).');
    if (o.rule21Systemic) route.push('Rule 21: for systemically absorbed substances, consult a medicines authority or the EMA (Annex IX Section 5.4).');
    if (cls === 'III' || o.implantable) {
      route.push('Summary of safety and clinical performance (SSCP) required for implantable and class III devices (Art. 32).');
    }
    if (cls === 'IIb' || cls === 'III') route.push('PSUR updated at least annually (Art. 86).');
    if (cls === 'IIa') route.push('PSUR updated when necessary and at least every two years (Art. 86).');
    if (cls === 'I') route.push('Post-market surveillance report, updated when necessary (Art. 85).');
    return { notifiedBody, route };
  }

  // ---------------------------------------------------------------------------
  // IVDR 2017/746
  // ---------------------------------------------------------------------------

  /*
   * IVDR profile:
   *
   * productType: 'assay' | 'calibrator' | 'control_assigned' | 'control_unassigned' |
   *              'instrument' | 'general_lab' | 'receptacle' | 'software'
   * purposes:    array of purpose codes from IVDR_PURPOSES below (Rules 1-3)
   * user:        'professional' | 'near_patient' | 'self_test'
   * selfTestException: bool  (pregnancy, fertility, cholesterol, or glucose/erythrocytes/leucocytes/bacteria in urine)
   * sterile:     bool
   * drivesDeviceClass: 'A'|'B'|'C'|'D'|null   (software that drives or influences a device, 1.4)
   */
  const IVDR_PURPOSES = {
    r1_donor_screening: ['Rule 1', 'D', 'Detects a transmissible agent in blood, blood components, cells, tissues or organs to assess suitability for transfusion, transplantation or cell administration.'],
    r1_life_threatening_propagation: ['Rule 1', 'D', 'Detects a transmissible agent that causes a life-threatening disease with a high or suspected high risk of propagation.'],
    r1_infectious_load: ['Rule 1', 'D', 'Determines the infectious load of a life-threatening disease where monitoring is critical in patient management.'],
    r2_high_risk_markers: ['Rule 2', 'D', 'Blood grouping or tissue typing for ABO, Rhesus (RH1-RH5), Kell (Kel1), Kidd (JK1, JK2) or Duffy (FY1, FY2).'],
    r2_other_markers: ['Rule 2', 'C', 'Blood grouping or tissue typing to ensure immunological compatibility (markers other than the Rule 2 class D list).'],
    r3a_sti: ['Rule 3(a)', 'C', 'Detects the presence of, or exposure to, a sexually transmitted agent.'],
    r3b_csf_blood: ['Rule 3(b)', 'C', 'Detects an infectious agent in cerebrospinal fluid or blood, without a high or suspected high risk of propagation.'],
    r3c_infectious_severe: ['Rule 3(c)', 'C', 'Detects an infectious agent where an erroneous result could cause death or severe disability to the person, foetus or embryo, or offspring.'],
    r3d_prenatal_immune: ['Rule 3(d)', 'C', 'Pre-natal screening of women to determine their immune status towards transmissible agents.'],
    r3e_immune_status: ['Rule 3(e)', 'C', 'Determines infective disease or immune status where an erroneous result could lead to a life-threatening management decision.'],
    r3f_cdx: ['Rule 3(f)', 'C', 'Companion diagnostic.'],
    r3g_staging: ['Rule 3(g)', 'C', 'Disease staging where an erroneous result could lead to a life-threatening management decision.'],
    r3h_cancer: ['Rule 3(h)', 'C', 'Screening, diagnosis or staging of cancer.'],
    r3i_genetic: ['Rule 3(i)', 'C', 'Human genetic testing.'],
    r3j_drug_monitoring: ['Rule 3(j)', 'C', 'Monitors levels of medicinal products, substances or biological components where an erroneous result could lead to a life-threatening management decision.'],
    r3k_life_threatening: ['Rule 3(k)', 'C', 'Management of patients with a life-threatening disease or condition.'],
    r3l_embryo_foetus: ['Rule 3(l)', 'C', 'Screening for congenital disorders in the embryo or foetus.'],
    r3m_newborn: ['Rule 3(m)', 'C', 'Screening for congenital disorders in newborns where failure to detect could lead to a life-threatening situation or severe disability.'],
  };

  function classifyIVDR(p) {
    p = p || {};
    const hits = [];
    const notes = [];
    const type = p.productType || 'assay';
    const purposes = (p.purposes || []).filter((k) => IVDR_PURPOSES[k]);

    // Rule 7: controls without an assigned value are class B regardless of analyte.
    if (type === 'control_unassigned') {
      hits.push(hit('Rule 7', 'B', 'Control material without a quantitative or qualitative assigned value.', 'IVDR Annex VIII 2.7'));
      return finishIVDR(hits, notes, p);
    }

    // Rule 5: class A products.
    if (type === 'general_lab') hits.push(hit('Rule 5(a)', 'A', 'Product for general laboratory use, buffer, washing solution, general culture medium or histological stain intended for IVD procedures.', 'IVDR Annex VIII 2.5'));
    if (type === 'instrument') hits.push(hit('Rule 5(b)', 'A', 'Instrument intended specifically for IVD procedures.', 'IVDR Annex VIII 2.5'));
    if (type === 'receptacle') hits.push(hit('Rule 5(c)', 'A', 'Specimen receptacle.', 'IVDR Annex VIII 2.5'));

    // Rules 1-3 by intended purpose. Instruments, general lab products and receptacles
    // do not take the class of the analytes they are used with.
    const analyteBased = !['general_lab', 'instrument', 'receptacle'].includes(type);
    if (analyteBased) {
      purposes.forEach((k) => {
        const [rule, cls, reason] = IVDR_PURPOSES[k];
        hits.push(hit(rule, cls, reason, 'IVDR Annex VIII 2.' + rule.charAt(5)));
      });
    } else if (purposes.length) {
      notes.push('Intended purposes were ignored: instruments, general laboratory products and specimen receptacles fall under Rule 5 in their own right (implementing rules 1.2 and 1.3).');
    }

    // Rule 4: self-testing / near-patient testing.
    // Rule 4 also covers instruments for self-testing (e.g. blood glucose meters), see MDCG 2020-16.
    if (p.user === 'self_test' && type !== 'general_lab' && type !== 'receptacle') {
      hits.push(
        p.selfTestException
          ? hit('Rule 4(a)', 'B', 'Self-test for pregnancy, fertility, cholesterol, or glucose, erythrocytes, leucocytes or bacteria in urine.', 'IVDR Annex VIII 2.4')
          : hit('Rule 4(a)', 'C', 'Device for self-testing.', 'IVDR Annex VIII 2.4')
      );
    }
    if (p.user === 'near_patient') {
      notes.push('Near-patient testing devices are classified in their own right (Rule 4(b)); the Notified Body also assesses the near-patient aspects (Annex IX Section 5.1).');
    }

    if (p.drivesDeviceClass) {
      hits.push(hit('Rule 1.4', p.drivesDeviceClass, 'Software that drives or influences the use of a device falls within the same class as that device.', 'IVDR Annex VIII 1.4'));
    }

    // Rule 6: everything else.
    if (hits.length === 0) {
      hits.push(hit('Rule 6', 'B', 'Not covered by Rules 1 to 5 or 7.', 'IVDR Annex VIII 2.6'));
    }

    if (type === 'calibrator') notes.push('Calibrator: takes the same class as the device it is intended to be used with (implementing rule 1.5).');
    if (type === 'control_assigned') notes.push('Control with assigned values: takes the same class as the device it is intended to be used with (implementing rule 1.6).');
    if (purposes.length > 1) notes.push('Several intended purposes or rules apply: the highest class is used (implementing rules 1.8 and 1.9).');

    return finishIVDR(hits, notes, p);
  }

  function finishIVDR(hits, notes, p) {
    const finalClass = highest(IVDR_ORDER, hits.map((h) => h.class));
    const decisive = hits.filter((h) => h.class === finalClass);
    const purposes = p.purposes || [];
    const conformity = ivdrConformity(finalClass, {
      sterile: !!p.sterile,
      cdx: purposes.includes('r3f_cdx'),
      selfOrNearPatient: p.user === 'self_test' || p.user === 'near_patient',
    });
    return {
      framework: 'EU IVDR 2017/746',
      inScope: true,
      class: finalClass,
      label: 'Class ' + finalClass + (finalClass === 'A' && p.sterile ? ' (sterile)' : ''),
      hits,
      decisive,
      notes,
      ...conformity,
    };
  }

  function ivdrConformity(cls, o) {
    const route = [];
    let notifiedBody = 'Required';
    if (cls === 'A') {
      if (o.sterile) {
        notifiedBody = 'Required, limited to sterility aspects';
        route.push('EU declaration of conformity with Annex II and III technical documentation; Notified Body assesses sterility aspects via Annex IX or Annex XI (Art. 48(10)).');
      } else {
        notifiedBody = 'Not required (self-declaration)';
        route.push('Manufacturer draws up Annex II and III technical documentation and issues the EU declaration of conformity (Art. 48(10)).');
      }
    } else if (cls === 'B') {
      route.push('Annex IX Chapters I and III, with technical documentation assessed for at least one representative device per category of devices (Art. 48(9)).');
    } else if (cls === 'C') {
      route.push('Annex IX Chapters I and III, with technical documentation assessed for at least one representative device per generic device group (Art. 48(7)).');
      route.push('Or: Annex X (EU type-examination) with Annex XI (production quality assurance).');
    } else {
      route.push('Annex IX Chapters I, II and III, including assessment of the technical documentation of every device (Art. 48(3)).');
      route.push('Or: Annex X (EU type-examination) with Annex XI (production quality assurance).');
      route.push('EU reference laboratory verifies performance and batch testing where one is designated (Art. 48(5)).');
      route.push('First certification of a device with no Common Specification: expert panel consultation on the performance evaluation report (Art. 48(6)).');
    }
    if (o.cdx) route.push('Companion diagnostic: Notified Body consults a medicines authority or the EMA (Annex IX Section 5.2).');
    if (o.selfOrNearPatient && cls !== 'A') route.push('Self-testing or near-patient device: Notified Body assesses the technical documentation for those aspects (Annex IX Section 5.1).');
    if (cls === 'C' || cls === 'D') route.push('Summary of safety and performance (SSP) required (Art. 29); PSUR updated at least annually (Art. 81).');
    if (cls === 'A' || cls === 'B') route.push('Post-market surveillance report, updated when necessary (Art. 80).');
    return { notifiedBody, route };
  }

  return {
    classifyMDR,
    classifyIVDR,
    IVDR_PURPOSES,
    MDR_ORDER,
    IVDR_ORDER,
  };
});
