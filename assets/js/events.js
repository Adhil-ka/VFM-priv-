/**
 * Event log.
 *
 * A seismograph strip gives the activity a readable shape; the list below carries
 * the detail. Filters are by severity, and each row expands to show why the system
 * did what it did at that moment.
 */

import { createSeismograph } from './charts/seismograph.js';
import { el, formatClockSeconds, formatDateTime, toneClass } from './format.js';

const TONE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'alert', label: 'Escalations' },
  { key: 'watch', label: 'Watch' },
  { key: 'good', label: 'Progress' },
  { key: 'system', label: 'System' }
];

export function createEventsView({ root }) {
  let events = [];
  let filterKey = 'all';

  // The strip owns its canvas; callers do not need to supply one.
  const canvas = el('canvas', 'event-strip-canvas');
  canvas.id = 'seismograph-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Recent system activity by severity');
  const seismograph = createSeismograph({ canvas });

  const strip = el('div', 'event-strip');
  strip.append(el('p', 'event-strip-label', 'Recent activity'), canvas);

  const filters = el('div', 'event-filters');
  filters.setAttribute('role', 'group');
  filters.setAttribute('aria-label', 'Filter events by severity');
  const filterButtons = new Map();
  for (const tone of TONE_FILTERS) {
    const button = el('button', 'chip-btn', tone.label);
    button.type = 'button';
    button.setAttribute('aria-pressed', String(tone.key === filterKey));
    button.addEventListener('click', () => {
      filterKey = tone.key;
      for (const [key, node] of filterButtons) node.setAttribute('aria-pressed', String(key === filterKey));
      render();
    });
    filterButtons.set(tone.key, button);
    filters.append(button);
  }

  const list = el('ol', 'event-list');
  list.setAttribute('aria-live', 'off');

  const empty = el('p', 'event-empty', 'Nothing recorded under this filter yet.');
  empty.hidden = true;

  root.replaceChildren(strip, filters, list, empty);

  function render() {
    const visible = filterKey === 'all' ? events : events.filter((event) => event.tone === filterKey);
    seismograph.setData(visible.length ? visible : events);

    const nodes = document.createDocumentFragment();
    for (const event of visible) {
      const item = el('li', `event-item ${toneClass(event.tone)}`);
      item.dataset.tone = event.tone;

      const marker = el('span', 'event-marker');
      marker.setAttribute('aria-hidden', 'true');

      const body = el('div', 'event-body');
      const head = el('div', 'event-head');
      const time = el('time', 'event-time', formatClockSeconds(event.timestamp));
      time.dateTime = new Date(event.timestamp).toISOString();
      const label = el('span', `chip chip-xs ${toneClass(event.tone)}`, toneLabel(event.tone));
      head.append(time, label);
      body.append(head, el('p', 'event-message', event.message));

      if (event.detail) {
        const details = el('details', 'event-detail');
        details.append(el('summary', null, 'Why'));
        const inner = el('div', 'event-detail-body');
        for (const line of event.detail) {
          const pair = el('p');
          pair.append(el('span', 'event-detail-key', line.label), el('span', 'event-detail-value', line.value));
          inner.append(pair);
        }
        details.append(inner);
        body.append(details);
      }

      const stamp = el('time', 'event-date', formatDateTime(event.timestamp));
      stamp.dateTime = new Date(event.timestamp).toISOString();

      item.append(marker, body, stamp);
      nodes.append(item);
    }
    list.replaceChildren(nodes);
    empty.hidden = visible.length > 0;
  }

  function toneLabel(tone) {
    return tone === 'alert' ? 'Escalation' : tone === 'watch' ? 'Watch' : tone === 'good' ? 'Progress' : 'System';
  }

  return {
    update(next) {
      events = next || [];
      render();
    },
    refresh: render,
    destroy() {
      seismograph.destroy();
    }
  };
}
