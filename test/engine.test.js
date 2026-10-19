// Reference cases for the classification engine. Run with: node --test
// Examples follow Annex VIII and the worked examples in MDCG 2021-24 and MDCG 2020-16.
const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyMDR, classifyIVDR } = require('../engine.js');

const mdr = [
  // Non-invasive, Rules 1-4
  ['Wheel chair (non-active)', {}, 'I'],
  ['Gravity IV administration set', { nonInvasive: { channelStore: 'other' } }, 'I'],
  ['Tubing for infusion pump', { nonInvasive: { channelStore: 'other', connectsToActiveIIaPlus: true } }, 'IIa'],
  ['Blood storage tube', { nonInvasive: { channelStore: 'blood_liquids_organs' } }, 'IIa'],
  ['Blood bag', { nonInvasive: { channelStore: 'blood_bag' } }, 'IIb'],
  ['Blood cell separator (centrifugation)', { nonInvasive: { modifiesComposition: 'physical' } }, 'IIa'],
  ['Haemodialyser', { nonInvasive: { modifiesComposition: 'other' } }, 'IIb'],
  ['IVF culture medium', { nonInvasive: { inVitroSubstanceForCellsOrEmbryos: true } }, 'III'],
  ['Absorbent wound pad', { injuredSkin: 'barrier' }, 'I'],
  ['Hydrogel dressing', { injuredSkin: 'micro_environment' }, 'IIa'],
  ['Dressing for chronic ulcer', { injuredSkin: 'breached_dermis' }, 'IIb'],

  // Body orifice, Rules 5 and 20
  ['Examination speculum', { invasiveness: 'orifice', duration: 'transient' }, 'I'],
  ['Urinary catheter, short-term', { invasiveness: 'orifice', duration: 'short' }, 'IIa'],
  ['Nasal packing, short-term', { invasiveness: 'orifice', duration: 'short', orifice: { upperCavitiesOnly: true } }, 'I'],
  ['Urethral stent, long-term', { invasiveness: 'orifice', duration: 'long' }, 'IIb'],
  ['Orthodontic wire', { invasiveness: 'orifice', duration: 'long', orifice: { upperCavitiesOnly: true } }, 'IIa'],
  ['Tracheal tube connected to ventilator', { invasiveness: 'orifice', duration: 'short', orifice: { connectsToActiveIIaPlus: true } }, 'IIa'],
  ['Spacer for metered-dose inhaler', { invasiveness: 'orifice', duration: 'transient', orifice: { inhalation: 'standard' } }, 'IIa'],
  ['Inhaler for life-threatening condition', { invasiveness: 'orifice', duration: 'transient', orifice: { inhalation: 'essential_or_life_threatening' } }, 'IIb'],
  ['Wound gel on injured mucosa via orifice', { invasiveness: 'orifice', duration: 'transient', injuredSkin: 'breached_dermis' }, 'IIb'],

  // Surgically invasive and implantable, Rules 6-8
  ['Single-use scalpel', { invasiveness: 'surgical', duration: 'transient' }, 'IIa'],
  ['Reusable surgical forceps', { invasiveness: 'surgical', duration: 'transient', surgical: { reusableInstrument: true } }, 'I'],
  ['Cardiovascular catheter (angioplasty balloon)', { invasiveness: 'surgical', duration: 'transient', surgical: { heartCirculatoryDefect: true } }, 'III'],
  ['Brachytherapy applicator', { invasiveness: 'surgical', duration: 'transient', surgical: { ionisingRadiation: true } }, 'IIb'],
  ['Insulin pen needle (hazardous delivery)', { invasiveness: 'surgical', duration: 'transient', surgical: { administersMedicinalHazardous: true } }, 'IIb'],
  ['Clamp, short-term', { invasiveness: 'surgical', duration: 'short' }, 'IIa'],
  ['Absorbable haemostat, short-term', { invasiveness: 'surgical', duration: 'short', surgical: { biologicalEffectOrAbsorbed: true } }, 'III'],
  ['Central venous catheter, short-term', { invasiveness: 'surgical', duration: 'short', surgical: { directContactHeartCirculatoryCNS: true } }, 'III'],
  ['Bone plate (implant)', { invasiveness: 'implantable', surgical: { ancillaryComponent: true } }, 'IIb'],
  ['Dental filling', { invasiveness: 'implantable', surgical: { placedInTeeth: true } }, 'IIa'],
  ['Absorbable suture', { invasiveness: 'implantable', surgical: { biologicalEffectOrAbsorbed: true } }, 'III'],
  ['Prosthetic heart valve', { invasiveness: 'implantable', surgical: { directContactHeartCirculatoryCNS: true } }, 'III'],
  ['Breast implant', { invasiveness: 'implantable', surgical: { breastImplantOrMesh: true } }, 'III'],
  ['Hip replacement', { invasiveness: 'implantable', surgical: { jointReplacement: true } }, 'III'],
  ['Hip screw (joint ancillary)', { invasiveness: 'implantable', surgical: { jointReplacement: true, ancillaryComponent: true } }, 'IIb'],
  ['Spinal cage', { invasiveness: 'implantable', surgical: { spinalContact: true } }, 'III'],
  ['Pacemaker lead accessory (AIMD)', { invasiveness: 'implantable', surgical: { activeImplantable: true } }, 'III'],
  ['Drug-eluting implant', { invasiveness: 'implantable', surgical: { administersMedicinal: true } }, 'III'],

  // Active devices, Rules 9, 10, 12, 13, 22
  ['Electric wheelchair', { active: { isActive: true } }, 'I'],
  ['TENS stimulator', { active: { isActive: true, therapeuticEnergy: true } }, 'IIa'],
  ['Surgical laser', { active: { isActive: true, therapeuticEnergy: true, therapeuticEnergyHazardous: true } }, 'IIb'],
  ['Radiotherapy linac', { active: { isActive: true, therapeuticIonising: true } }, 'IIb'],
  ['Pacemaker programmer', { active: { isActive: true, controlsActiveImplantable: true } }, 'III'],
  ['Diagnostic ultrasound', { active: { isActive: true, diagnosticEnergyAbsorbed: true } }, 'IIa'],
  ['Examination lamp', { active: { isActive: true, diagnosticEnergyAbsorbed: true, illuminatesVisibleOnly: true } }, 'I'],
  ['Gamma camera', { active: { isActive: true, radiopharmaceuticalImaging: true } }, 'IIa'],
  ['Electronic thermometer', { active: { isActive: true, directDiagnosisVital: true } }, 'IIa'],
  ['ICU patient monitor', { active: { isActive: true, directDiagnosisVital: true, vitalImmediateDanger: true } }, 'IIb'],
  ['CT scanner', { active: { isActive: true, diagnosticIonisingRadiology: true } }, 'IIb'],
  ['Enteral feeding pump', { active: { isActive: true, administersSubstances: true } }, 'IIa'],
  ['Infusion pump', { active: { isActive: true, administersSubstances: true, administersSubstancesHazardous: true } }, 'IIb'],
  ['Automated external defibrillator', { active: { isActive: true, therapeuticEnergy: true, therapeuticEnergyHazardous: true, closedLoop: true } }, 'III'],

  // Software, Rule 11
  ['Hospital archiving software', { software: { isSoftware: true } }, 'I'],
  ['Software ranking therapy options (non-serious)', { software: { isSoftware: true, decisions: 'other' } }, 'IIa'],
  ['Software diagnosing melanoma', { software: { isSoftware: true, decisions: 'serious' } }, 'IIb'],
  ['Software diagnosing stroke for thrombolysis', { software: { isSoftware: true, decisions: 'death_irreversible' } }, 'III'],
  ['Sleep apnoea monitoring app', { software: { isSoftware: true, monitoring: 'physiological' } }, 'IIa'],
  ['Software monitoring ICU vital signs', { software: { isSoftware: true, monitoring: 'vital_immediate_danger' } }, 'IIb'],
  ['Insulin dose calculator driving a IIb pump', { software: { isSoftware: true, drivesDeviceClass: 'IIb' } }, 'IIb'],

  // Special rules, 14-21
  ['Heparin-coated catheter', { invasiveness: 'surgical', duration: 'short', special: { medicinalAncillary: true } }, 'III'],
  ['Condom', { invasiveness: 'orifice', duration: 'transient', special: { contraceptionOrSTI: true } }, 'IIb'],
  ['Copper IUD', { invasiveness: 'orifice', duration: 'long', special: { contraceptionOrSTI: true } }, 'III'],
  ['Contact lens solution', { special: { disinfection: 'contact_lens' } }, 'IIb'],
  ['Sterilizer for medical devices', { active: { isActive: true }, special: { disinfection: 'medical_devices' } }, 'IIa'],
  ['Endoscope washer-disinfector', { active: { isActive: true }, special: { disinfection: 'invasive_end_point' } }, 'IIb'],
  ['X-ray detector / film', { special: { xrayImageRecording: true } }, 'IIa'],
  ['Bovine pericardium patch', { invasiveness: 'implantable', special: { tissues: 'animal' } }, 'III'],
  ['Leather orthosis (animal, intact skin)', { special: { tissues: 'animal_intact_skin' } }, 'I'],
  ['Nanomaterial, high exposure', { special: { nanomaterial: 'high' } }, 'III'],
  ['Nanomaterial, low exposure', { special: { nanomaterial: 'low' } }, 'IIb'],
  ['Nanomaterial, negligible exposure', { special: { nanomaterial: 'negligible' } }, 'IIa'],
  ['Substance-based throat spray', { special: { substance: { isSubstance: true, route: 'nasal_oral' } } }, 'IIa'],
  ['Simethicone (stomach, not absorbed)', { special: { substance: { isSubstance: true, route: 'gi' } } }, 'IIb'],
  ['Substance absorbed systemically from GI', { special: { substance: { isSubstance: true, route: 'gi', systemicAbsorption: true } } }, 'III'],
  ['Substance-based ear drops (Rule 21 has no ear exception)', { special: { substance: { isSubstance: true, route: 'other' } } }, 'IIb'],
];

for (const [name, profile, expected] of mdr) {
  test(`MDR: ${name} -> Class ${expected}`, () => {
    assert.equal(classifyMDR(profile).class, expected);
  });
}

test('MDR 3.6(b): short-term units replaced immediately accumulate to long-term', () => {
  const r = classifyMDR({ invasiveness: 'orifice', duration: 'short', replacedImmediately: true, accumulatedDuration: 'long' });
  assert.equal(r.effectiveDuration, 'long');
  assert.equal(r.class, 'IIb');
});

test('MDR 3.5: highest of several rules wins and is marked decisive', () => {
  const r = classifyMDR({ injuredSkin: 'barrier', special: { tissues: 'human' } });
  assert.equal(r.class, 'III');
  assert.deepEqual(r.decisive.map((h) => h.rule), ['Rule 18']);
});

test('MDR qualifiers: Is, Im, Ir only on class I', () => {
  assert.equal(classifyMDR({ classIFlags: { sterile: true, measuring: true } }).label, 'Class I (Is, Im)');
  assert.equal(classifyMDR({ invasiveness: 'surgical', surgical: { reusableInstrument: true } }).label, 'Class I (Ir)');
  assert.equal(classifyMDR({ injuredSkin: 'other', classIFlags: { sterile: true } }).label, 'Class IIa');
});

test('MDR qualification: PIM product is out of scope', () => {
  const r = classifyMDR({ qualification: { pim: true } });
  assert.equal(r.inScope, false);
  assert.equal(r.class, null);
});

test('MDR conformity: implantable class III triggers Art. 54 consultation', () => {
  const r = classifyMDR({ invasiveness: 'implantable', surgical: { jointReplacement: true } });
  assert.ok(r.route.some((s) => s.includes('Art. 54')));
});

const ivdr = [
  ['HIV blood donor screening', { purposes: ['r1_donor_screening'] }, 'D'],
  ['Viral load for life-threatening infection', { purposes: ['r1_infectious_load'] }, 'D'],
  ['ABO / RhD grouping', { purposes: ['r2_high_risk_markers'] }, 'D'],
  ['MNS blood grouping', { purposes: ['r2_other_markers'] }, 'C'],
  ['Chlamydia test', { purposes: ['r3a_sti'] }, 'C'],
  ['Companion diagnostic', { purposes: ['r3f_cdx'] }, 'C'],
  ['PSA cancer screening', { purposes: ['r3h_cancer'] }, 'C'],
  ['Genetic test', { purposes: ['r3i_genetic'] }, 'C'],
  ['Newborn PKU screening', { purposes: ['r3m_newborn'] }, 'C'],
  ['Cholesterol test (professional)', { purposes: [] }, 'B'],
  ['Pregnancy self-test', { user: 'self_test', selfTestException: true }, 'B'],
  ['Blood glucose self-test', { user: 'self_test' }, 'C'],
  ['HIV self-test', { user: 'self_test', purposes: ['r1_life_threatening_propagation'] }, 'D'],
  ['General culture medium', { productType: 'general_lab' }, 'A'],
  ['IVD analyser', { productType: 'instrument', purposes: ['r1_donor_screening'] }, 'A'],
  ['Specimen receptacle', { productType: 'receptacle' }, 'A'],
  ['Control without assigned value', { productType: 'control_unassigned', purposes: ['r1_donor_screening'] }, 'B'],
  ['Calibrator for HIV assay', { productType: 'calibrator', purposes: ['r1_donor_screening'] }, 'D'],
  ['Control with assigned values for CDx', { productType: 'control_assigned', purposes: ['r3f_cdx'] }, 'C'],
  ['Software driving a class C device', { productType: 'software', drivesDeviceClass: 'C' }, 'C'],
];

for (const [name, profile, expected] of ivdr) {
  test(`IVDR: ${name} -> Class ${expected}`, () => {
    assert.equal(classifyIVDR(profile).class, expected);
  });
}

test('IVDR: sterile class A needs a Notified Body for sterility', () => {
  const r = classifyIVDR({ productType: 'receptacle', sterile: true });
  assert.equal(r.label, 'Class A (sterile)');
  assert.match(r.notifiedBody, /sterility/);
});

// Expert review round 2
test('MDR Rule 18: intact-skin exception does not apply to invasive devices', () => {
  assert.equal(classifyMDR({ special: { tissues: 'animal_intact_skin' } }).class, 'I');
  assert.equal(classifyMDR({ invasiveness: 'implantable', special: { tissues: 'animal_intact_skin' } }).class, 'III');
  assert.equal(classifyMDR({ injuredSkin: 'barrier', special: { tissues: 'animal_intact_skin' } }).class, 'III');
});

test('MDR: implantable class IIb and IIa devices need SSCP and clinical investigation', () => {
  const plate = classifyMDR({ invasiveness: 'implantable', surgical: { ancillaryComponent: true } });
  assert.ok(plate.route.some((s) => s.includes('Art. 32')));
  assert.ok(plate.route.some((s) => s.includes('Art. 61')));
  const filling = classifyMDR({ invasiveness: 'implantable', surgical: { placedInTeeth: true } });
  assert.equal(filling.class, 'IIa');
  assert.ok(filling.route.some((s) => s.includes('Art. 32')));
});

test('MDR Rule 21: medicines authority consultation only when systemically absorbed', () => {
  const local = classifyMDR({ special: { substance: { isSubstance: true, route: 'gi' } } });
  assert.ok(!local.route.some((s) => s.includes('5.4')));
  const systemic = classifyMDR({ special: { substance: { isSubstance: true, route: 'gi', systemicAbsorption: true } } });
  assert.ok(systemic.route.some((s) => s.includes('5.4')));
});

test('MDR class I: post-market surveillance report listed', () => {
  assert.ok(classifyMDR({}).route.some((s) => s.includes('Art. 85')));
});

test('IVDR Rule 4: self-testing instrument (blood glucose meter) is class C', () => {
  assert.equal(classifyIVDR({ productType: 'instrument', user: 'self_test' }).class, 'C');
  assert.equal(classifyIVDR({ productType: 'instrument' }).class, 'A');
});
