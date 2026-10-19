/*
 * Global alerts page. Reads alerts/alerts.json (written by alerts/collector.py)
 * and filters it in the browser. The Refresh button calls server.py's
 * /api/refresh; when the page is opened without server.py it is hidden.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const filters = ['f_text', 'f_agency', 'f_kind', 'f_product', 'f_days'].map($);
  let data = null;

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k === 'class') node.className = v;
      else node.setAttribute(k, v);
    });
    children.flat().forEach((c) => c != null && node.append(c));
    return node;
  }

  function fillSelect(select, values) {
    const current = select.value;
    select.length = 1;
    values.forEach((v) => select.append(el('option', { value: v }, v)));
    if (values.includes(current)) select.value = current;
  }

  function slug(s) {
    return s.toLowerCase().replace(/[^a-z]+/g, '-');
  }

  function daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  }

  function matches(item) {
    const [text, agency, kind, product, days] = filters.map((f) => f.value);
    if (agency && item.agency !== agency) return false;
    if (kind && !item.tags.includes(kind)) return false;
    if (product && item.product !== product) return false;
    if (item.date && item.date < daysAgo(Number(days))) return false;
    if (text) {
      const hay = `${item.title} ${item.summary} ${item.firm || ''} ${item.reference || ''}`.toLowerCase();
      if (!text.toLowerCase().split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  }

  function render() {
    if (!data) return;
    const items = data.items.filter(matches);

    const counts = {};
    items.forEach((i) => (counts[i.kind] = (counts[i.kind] || 0) + 1));
    const chips = $('kind_counts');
    chips.innerHTML = '';
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([k, n]) => {
        const chip = el('button', { type: 'button', class: `chip kind-${slug(k)}` }, `${k} `, el('strong', {}, String(n)));
        chip.addEventListener('click', () => {
          $('f_kind').value = $('f_kind').value === k ? '' : k;
          render();
        });
        chips.append(chip);
      });

    $('result_count').textContent = `${items.length} of ${data.items.length} notices shown`;
    const list = $('alert_list');
    list.innerHTML = '';
    items.slice(0, 500).forEach((i) => {
      const meta = [i.classification && `Class: ${i.classification}`, i.status && `Status: ${i.status}`, i.reference && `Ref: ${i.reference}`, i.alert_type, i.firm_country && `Firm country: ${i.firm_country}`].filter(Boolean);
      list.append(
        el('li', { class: 'alert-item' },
          el('div', { class: 'alert-head' },
            el('time', { datetime: i.date }, i.date || 'Undated'),
            el('span', { class: 'agency' }, i.agency),
            el('span', { class: `pill kind-${slug(i.kind)}` }, i.kind),
            el('span', { class: 'product' }, i.product)
          ),
          i.link ? el('a', { href: i.link, target: '_blank', rel: 'noopener', class: 'alert-title' }, i.title) : el('span', { class: 'alert-title' }, i.title),
          i.summary ? el('p', { class: 'alert-summary' }, i.summary) : null,
          meta.length ? el('p', { class: 'alert-meta' }, meta.join(' · ')) : null
        )
      );
    });
    if (items.length > 500) list.append(el('li', { class: 'hint' }, 'Showing the first 500. Narrow the filters to see the rest.'));
  }

  function renderSources() {
    const body = $('sources_body');
    body.innerHTML = '';
    data.sources.forEach((s) =>
      body.append(
        el('tr', {},
          el('td', {}, s.agency),
          el('td', {}, s.name),
          el('td', { class: 'num' }, String(s.count)),
          el('td', { class: s.ok ? 'ok' : 'fail', title: s.error || '' }, s.ok ? 'Loaded' : `Failed: ${s.error || 'unknown error'}`)
        )
      )
    );
    const watch = $('watch_list');
    watch.innerHTML = '';
    (data.watch_list || []).forEach((w) =>
      watch.append(
        el('li', {},
          el('a', { href: w.url, target: '_blank', rel: 'noopener' }, `${w.agency}${w.country ? ` (${w.country})` : ''}: ${w.name}`),
          w.note ? el('span', { class: 'hint' }, ` ${w.note}`) : null
        )
      )
    );
  }

  async function load() {
    try {
      const res = await fetch('alerts/alerts.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(res.status);
      data = await res.json();
    } catch (e) {
      data = null;
    }
    $('empty_state').hidden = !!(data && data.items.length);
    if (data && !data.items.length && data.sources.every((s) => !s.ok)) {
      $('empty_text').textContent = 'None of the regulator feeds could be reached. Check that this computer is online and that a firewall or proxy is not blocking python, then press Refresh. Each feed\u2019s error is listed under Sources.';
    }
    if (!data) return;
    fillSelect($('f_agency'), [...new Set(data.items.map((i) => i.agency))].sort());
    fillSelect($('f_kind'), [...new Set(data.items.flatMap((i) => i.tags))].sort());
    fillSelect($('f_product'), [...new Set(data.items.map((i) => i.product))].sort());
    const failed = data.sources.filter((s) => !s.ok).length;
    $('collected').textContent = `Collected ${new Date(data.generated).toLocaleString()} from ${data.sources.length - failed} of ${data.sources.length} feeds.`;
    renderSources();
    render();
  }

  // Refresh only works when served by server.py.
  const btn = $('refresh_btn');
  async function pollStatus() {
    try {
      const res = await fetch('api/status', { cache: 'no-store' });
      if (!res.ok) throw new Error();
      const s = await res.json();
      btn.hidden = false;
      btn.disabled = s.running;
      btn.textContent = s.running ? 'Collecting alerts…' : 'Refresh from regulators';
      if (s.running) setTimeout(pollStatus, 3000);
      else if (btn.dataset.waiting) {
        delete btn.dataset.waiting;
        load();
      }
      return true;
    } catch (e) {
      btn.hidden = true;
      return false;
    }
  }
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Collecting alerts…';
    btn.dataset.waiting = '1';
    await fetch('api/refresh', { method: 'POST' }).catch(() => null);
    setTimeout(pollStatus, 2000);
  });

  filters.forEach((f) => f.addEventListener('input', render));
  load();
  pollStatus().then((served) => {
    if (served) {
      btn.dataset.waiting = '1';
      pollStatus();
    }
  });
})();
