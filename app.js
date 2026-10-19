/*
 * Browser wiring for engine.js. Every input carries a data-path that names its
 * field in the device profile (e.g. "surgical.reusableInstrument"). Containers
 * with data-show-if="path=value1,value2" are shown only when that field holds
 * one of the listed values; inputs inside hidden containers are left out of
 * the profile so stale answers never affect the result.
 */
(function () {
  'use strict';
  const Engine = window.ClassificationEngine;

  const mdrSection = document.getElementById('mdr_section');
  const ivdrSection = document.getElementById('ivdr_section');

  // Build the IVDR purpose checkboxes from the engine's list so labels and logic stay in step.
  const purposeGrid = document.getElementById('ivd_purposes');
  Object.entries(Engine.IVDR_PURPOSES).forEach(([key, [rule, cls, text]]) => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'ivd_purpose';
    input.value = key;
    label.appendChild(input);
    label.appendChild(document.createTextNode(` ${rule}, class ${cls}: ${text}`));
    purposeGrid.appendChild(label);
  });

  function framework() {
    return document.querySelector('input[name="framework"]:checked').value;
  }

  function setPath(obj, path, value) {
    const keys = path.split('.');
    let o = obj;
    keys.slice(0, -1).forEach((k) => {
      o[k] = o[k] || {};
      o = o[k];
    });
    o[keys[keys.length - 1]] = value;
  }

  function getPath(obj, path) {
    return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  }

  function inputValue(el) {
    if (el.type === 'checkbox') return el.checked;
    return el.value === '' ? null : el.value;
  }

  function isHidden(el, root) {
    for (let n = el; n && n !== root; n = n.parentElement) {
      if (n.hidden) return true;
    }
    return false;
  }

  function readProfile(root) {
    const profile = {};
    root.querySelectorAll('[data-path]').forEach((el) => {
      if (!isHidden(el, root)) setPath(profile, el.dataset.path, inputValue(el));
    });
    if (root === ivdrSection) {
      profile.purposes = isHidden(purposeGrid, root)
        ? []
        : Array.from(root.querySelectorAll('.ivd_purpose:checked')).map((el) => el.value);
    }
    return profile;
  }

  function applyVisibility(root) {
    // Two passes so that nested conditions settle after their parents.
    for (let pass = 0; pass < 2; pass++) {
      const profile = readProfile(root);
      root.querySelectorAll('[data-show-if]').forEach((el) => {
        const [path, values] = el.dataset.showIf.split('=');
        const current = String(getPath(profile, path));
        el.hidden = !values.split(',').includes(current);
      });
    }
  }

  function list(id, items, render) {
    const ul = document.getElementById(id);
    ul.innerHTML = '';
    items.forEach((item) => {
      const li = document.createElement('li');
      render(li, item);
      ul.appendChild(li);
    });
  }

  function update() {
    const isMDR = framework() === 'mdr';
    mdrSection.hidden = !isMDR;
    ivdrSection.hidden = isMDR;
    const root = isMDR ? mdrSection : ivdrSection;
    applyVisibility(root);

    const profile = readProfile(root);
    const result = isMDR ? Engine.classifyMDR(profile) : Engine.classifyIVDR(profile);

    const badge = document.getElementById('final_badge');
    badge.textContent = result.label;
    badge.className = 'badge ' + (result.class ? 'class-' + result.class : 'class-none');

    document.getElementById('res_framework').textContent = result.framework;
    document.getElementById('res_nb').textContent = result.notifiedBody;
    const durRow = document.getElementById('res_duration_row');
    durRow.hidden = !result.effectiveDuration;
    document.getElementById('res_duration').textContent = result.effectiveDuration || '';

    list('res_rules_list', result.hits, (li, h) => {
      if (result.decisive.includes(h)) li.className = 'decisive';
      const head = document.createElement('span');
      head.className = 'rule-head';
      head.textContent = `${h.rule} → ${h.class}`;
      const ref = document.createElement('span');
      ref.className = 'rule-ref';
      ref.textContent = h.ref;
      li.append(head, ref, document.createElement('br'), document.createTextNode(h.reason));
    });
    document.getElementById('res_notes_block').hidden = result.notes.length === 0;
    list('res_notes', result.notes, (li, n) => (li.textContent = n));
    list('res_route', result.route, (li, r) => (li.textContent = r));
  }

  document.addEventListener('change', update);
  document.getElementById('reset_btn').addEventListener('click', () => {
    document.querySelectorAll('input[type="checkbox"]').forEach((el) => (el.checked = false));
    document.querySelectorAll('select').forEach((el) => (el.selectedIndex = 0));
    update();
  });

  update();
})();
