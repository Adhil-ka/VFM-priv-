/**
 * Readings table.
 *
 * A sortable, filterable, paginated log of every admissible reading. This is also
 * the accessible equivalent of the oscilloscope: the canvas trace is a shape, this
 * is the data behind it, and a screen-reader user gets every value from here.
 *
 * Nulls always sort last in both directions, because "no reading" and "reading of
 * zero" are very different facts in a clinical table and must not be confusable.
 */

import { createSparkline } from './charts/sparkline.js';
import {
  el,
  formatClockSeconds,
  formatFixed,
  formatPercent,
  spo2Band,
  perfusionBand,
  qualityBand
} from './format.js';
import { OPTICAL } from './engine.js';

const PAGE_SIZE = 50;
const SPARK_WINDOW = 12;

const COLUMNS = [
  { key: 'time', label: 'Time', hint: 'Local time of the reading', sort: (r) => r.timestamp, align: 'start' },
  { key: 'ratio', label: 'Flow ratio', hint: 'High-band power ÷ low-band power', sort: (r) => r.ratio, align: 'end' },
  { key: 'baseline', label: 'Baseline', hint: 'Personal baseline ratio in effect', sort: (r) => r.baselineRatio, align: 'end' },
  { key: 'delta', label: 'Δ from base', hint: 'Percentage difference from the personal baseline', sort: (r) => r.deltaPercent, align: 'end' },
  { key: 'spo2', label: 'SpO₂', hint: 'Peripheral oxygen saturation from the optical sensor', sort: (r) => r.spo2, align: 'end' },
  { key: 'hr', label: 'Heart rate', hint: 'Pulse rate from the optical sensor, with recent trend', sort: (r) => r.bpm, align: 'end' },
  { key: 'pi', label: 'PI', hint: 'Perfusion index — how much optical signal is reaching the sensor', sort: (r) => r.perfusionIndex, align: 'end' },
  { key: 'quality', label: 'Quality', hint: 'Acoustic signal quality score', sort: (r) => r.quality, align: 'end' },
  { key: 'state', label: 'State', hint: 'How this reading was classified', sort: (r) => (r.anomalous ? 1 : 0), align: 'start' }
];

const FILTERS = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'anomalous', label: 'Anomalous', match: (r) => r.anomalous },
  { key: 'lowspo2', label: `SpO₂ < ${OPTICAL.spo2.warn}`, match: (r) => Number.isFinite(r.spo2) && r.spo2 < OPTICAL.spo2.warn },
  { key: 'poor', label: 'Poor signal', match: (r) => Number.isFinite(r.quality) && r.quality < 70 },
  { key: 'nooptical', label: 'No optical', match: (r) => r.spo2 == null || r.bpm == null }
];

function rowKey(reading) {
  return `${reading.timestamp}-${reading.sequence ?? 0}`;
}

function isNullish(value) {
  return value == null || !Number.isFinite(value);
}

function compare(a, b, sortFn, direction) {
  const left = sortFn(a);
  const right = sortFn(b);
  const leftMissing = left == null || (typeof left === 'number' && !Number.isFinite(left));
  const rightMissing = right == null || (typeof right === 'number' && !Number.isFinite(right));
  if (leftMissing && rightMissing) return 0;
  if (leftMissing) return 1;
  if (rightMissing) return -1;
  const result = typeof left === 'string' ? String(left).localeCompare(String(right)) : left - right;
  return direction === 'asc' ? result : -result;
}

export function createReadingsTable({ root, onInspect, onInspectEnd }) {
  let all = [];
  let baseline = null;
  let sortKey = 'time';
  let sortDirection = 'desc';
  let filterKey = 'all';
  let page = 0;
  let following = true;
  let unseen = 0;

  // ── Shell ────────────────────────────────────────────────────────────────
  const toolbar = el('div', 'rt-toolbar');
  const filterGroup = el('div', 'rt-filters');
  filterGroup.setAttribute('role', 'group');
  filterGroup.setAttribute('aria-label', 'Filter readings');

  const filterButtons = new Map();
  for (const filter of FILTERS) {
    const button = el('button', 'chip-btn', filter.label);
    button.type = 'button';
    button.setAttribute('aria-pressed', String(filter.key === filterKey));
    button.addEventListener('click', () => {
      filterKey = filter.key;
      page = 0;
      syncFilterButtons();
      render();
    });
    filterButtons.set(filter.key, button);
    filterGroup.append(button);
  }

  const spacer = el('div', 'rt-toolbar-spacer');
  const newPill = el('button', 'rt-new', '');
  newPill.type = 'button';
  newPill.hidden = true;
  newPill.addEventListener('click', () => {
    following = true;
    unseen = 0;
    page = 0;
    render();
  });

  toolbar.append(filterGroup, spacer, newPill);

  const scroll = el('div', 'rt-scroll');
  scroll.tabIndex = 0;
  scroll.setAttribute('role', 'region');
  scroll.setAttribute('aria-label', 'Reading log');

  const table = el('table', 'rt-table');
  const caption = el('caption', 'visually-hidden');
  caption.textContent =
    'Every admissible reading, newest first. SpO₂ and heart rate come from the optical sensor and require a v2 telemetry frame.';
  const thead = el('thead');
  const headRow = el('tr');
  const headerCells = new Map();

  for (const column of COLUMNS) {
    const th = el('th');
    th.scope = 'col';
    th.dataset.align = column.align;
    th.dataset.column = column.key;
    th.title = column.hint;

    const button = el('button', 'rt-sort', column.label);
    button.type = 'button';
    button.append(el('span', 'rt-sort-caret', ''));
    th.append(button);
    headerCells.set(column.key, th);
    headRow.append(th);
  }
  thead.append(headRow);

  const tbody = el('tbody');
  table.append(caption, thead, tbody);
  scroll.append(table);

  const footer = el('div', 'rt-foot');
  const prevButton = el('button', 'btn btn-ghost btn-sm', 'Newer');
  prevButton.type = 'button';
  const pagerText = el('p', 'rt-pager', '');
  const nextButton = el('button', 'btn btn-ghost btn-sm', 'Older');
  nextButton.type = 'button';
  const followButton = el('button', 'btn btn-ghost btn-sm btn-follow', 'Following live');
  followButton.type = 'button';
  followButton.setAttribute('aria-pressed', 'true');

  prevButton.addEventListener('click', () => {
    page = Math.max(0, page - 1);
    following = false;
    render();
  });
  nextButton.addEventListener('click', () => {
    page += 1;
    following = false;
    render();
  });
  followButton.addEventListener('click', () => {
    following = !following;
    if (following) {
      page = 0;
      unseen = 0;
    }
    render();
  });

  footer.append(prevButton, pagerText, nextButton, followButton);

  const empty = el('div', 'rt-empty');
  empty.hidden = true;
  const emptyTitle = el('h3', null, 'No readings yet');
  const emptyBody = el(
    'p',
    null,
    'Start the guided demo from the Demo tab, or connect a band and calibrate. Readings appear here as they arrive.'
  );
  empty.append(emptyTitle, emptyBody);

  root.replaceChildren(toolbar, scroll, footer, empty);

  // ── Sorting ──────────────────────────────────────────────────────────────
  for (const [key, th] of headerCells) {
    const column = COLUMNS.find((c) => c.key === key);
    th.querySelector('button').addEventListener('click', () => {
      if (sortKey === key) {
        if (sortDirection === 'desc') sortDirection = 'asc';
        else {
          sortKey = 'time';
          sortDirection = 'desc';
          following = sortKey === 'time' && sortDirection === 'desc';
        }
      } else {
        sortKey = key;
        sortDirection = 'asc';
        following = false;
      }
      page = 0;
      render();
    });
    void column;
  }

  function syncFilterButtons() {
    for (const [key, button] of filterButtons) {
      button.setAttribute('aria-pressed', String(key === filterKey));
    }
  }

  function syncSortHeaders() {
    for (const [key, th] of headerCells) {
      if (key === sortKey) {
        th.setAttribute('aria-sort', sortDirection === 'asc' ? 'ascending' : 'descending');
      } else {
        th.removeAttribute('aria-sort');
      }
    }
  }

  // ── Cell builders ────────────────────────────────────────────────────────

  function numCell(label, text, tone, extra) {
    const cell = el('td');
    cell.dataset.label = label;
    cell.dataset.align = 'end';
    const value = el('span', 'num', text);
    if (tone) value.dataset.tone = tone;
    cell.append(value);
    if (extra) cell.append(extra);
    return cell;
  }

  function dashCell(label, reason) {
    const cell = el('td', 'num');
    cell.dataset.label = label;
    cell.dataset.align = 'end';
    const value = el('span', 'num num-empty', '—');
    value.title = reason;
    cell.append(value);
    return cell;
  }

  function bar(value, max, tone) {
    const wrap = el('span', 'bar');
    const fill = el('span', 'bar-fill');
    fill.style.setProperty('--bar', `${Math.max(2, Math.min(100, (value / max) * 100))}%`);
    if (tone) fill.dataset.tone = tone;
    wrap.append(fill);
    return wrap;
  }

  function spo2Cell(reading) {
    if (isNullish(reading.spo2)) {
      const reason = !reading.ppgValid
        ? 'The band did not assert the PPG-valid flag, so optical values are not admissible.'
        : reading.protocol === 1
          ? 'This reading came from a v1 frame, which carries no saturation field.'
          : 'Reported saturation was outside 50-100% and was discarded.';
      return dashCell('SpO₂', reason);
    }
    const band = spo2Band(reading.spo2);
    const cell = el('td');
    cell.dataset.label = 'SpO₂';
    cell.dataset.align = 'end';
    const value = el('span', 'num', `${reading.spo2}%`);
    value.dataset.tone = band.tone;
    cell.append(value, bar(reading.spo2, 100, band.tone === 'nominal' ? 'nominal' : band.tone));
    return cell;
  }

  function hrCell(reading, sparkValues) {
    if (isNullish(reading.bpm)) {
      const reason = !reading.ppgValid
        ? 'The band did not assert the PPG-valid flag.'
        : reading.protocol === 1
          ? 'This reading came from a v1 frame, which carries no pulse field.'
          : 'Reported pulse rate was outside 30-220 bpm and was discarded.';
      return dashCell('HR', reason);
    }
    const baselineValue = baseline?.bpm;
    const tone =
      baselineValue != null && reading.bpm > baselineValue * 1.25 ? 'alert' : baselineValue != null && reading.bpm < baselineValue * 0.75 ? 'watch' : 'nominal';
    const cell = el('td');
    cell.dataset.label = 'HR';
    cell.dataset.align = 'end';
    const stack = el('span', 'hr-stack');
    const value = el('span', 'num', String(reading.bpm));
    value.dataset.tone = tone;
    stack.append(value);
    const usable = sparkValues.filter(Number.isFinite);
    if (usable.length > 1) {
      stack.append(createSparkline({ values: usable, tone: tone === 'nominal' ? 'nominal' : tone, width: 42, height: 16 }));
    }
    cell.append(stack);
    return cell;
  }

  function stateCell(reading) {
    const cell = el('td', 'state-cell');
    cell.dataset.label = 'State';
    cell.dataset.align = 'start';
    const chip = el('span', 'chip');
    if (reading.anomalous) {
      chip.dataset.tone = 'alert';
      chip.textContent = 'Flagged';
      cell.title = reading.reason || 'Deviation from personal baseline';
    } else if (reading.deltaPercent != null && Math.abs(reading.deltaPercent) >= 3) {
      chip.dataset.tone = 'watch';
      chip.textContent = 'Drifting';
    } else {
      chip.dataset.tone = 'nominal';
      chip.textContent = 'Nominal';
    }
    cell.append(chip);
    if (reading.anomalous && reading.reason) {
      const reason = el('p', 'state-reason', reading.reason);
      cell.append(reason);
    }
    return cell;
  }

  function buildRow(reading, sparkValues, index) {
    const row = el('tr');
    row.dataset.key = rowKey(reading);
    if (reading.anomalous) row.dataset.tone = 'alert';
    else if (reading.deltaPercent != null && Math.abs(reading.deltaPercent) >= 3) row.dataset.tone = 'watch';

    const indexCell = el('td', 'rt-index');
    indexCell.dataset.label = '#';
    indexCell.dataset.align = 'end';
    indexCell.append(el('span', 'num num-faint', String(index)));
    row.append(indexCell);

    const timeCell = el('td');
    timeCell.dataset.label = 'Time';
    timeCell.dataset.align = 'start';
    timeCell.append(el('span', 'num', formatClockSeconds(reading.timestamp)));
    if (reading.source === 'demo') {
      const tag = el('span', 'chip chip-xs', 'Demo');
      tag.dataset.tone = 'info';
      timeCell.append(tag);
    }
    row.append(timeCell);

    row.append(numCell('Flow ratio', formatFixed(reading.ratio, 3), null));
    row.append(isNullish(reading.baselineRatio) ? dashCell('Baseline', 'No personal baseline was active for this reading.') : numCell('Baseline', formatFixed(reading.baselineRatio, 3), 'faint'));

    const deltaTone = reading.anomalous ? 'alert' : Math.abs(reading.deltaPercent ?? 0) >= 3 ? 'watch' : 'nominal';
    row.append(numCell('Δ from base', formatPercent(reading.deltaPercent), reading.anomalous ? 'alert' : deltaTone));

    row.append(spo2Cell(reading));
    row.append(hrCell(reading, sparkValues));
    row.append(
      isNullish(reading.perfusionIndex)
        ? dashCell('PI', 'No perfusion index reported by the band.')
        : numCell('PI', `${reading.perfusionIndex}%`, perfusionBand(reading.perfusionIndex).tone)
    );
    row.append(
      isNullish(reading.quality)
        ? dashCell('Quality', 'No quality score reported.')
        : numCell('Quality', `${reading.quality}`, qualityBand(reading.quality).tone, bar(reading.quality, 100, 'info'))
    );
    row.append(stateCell(reading));

    row.addEventListener('pointerenter', () => onInspect?.(reading));
    row.addEventListener('focusin', () => onInspect?.(reading));
    row.addEventListener('pointerleave', () => onInspectEnd?.());
    return row;
  }

  // ── Render ───────────────────────────────────────────────────────────────
  function render() {
    syncSortHeaders();

    const filter = FILTERS.find((f) => f.key === filterKey) ?? FILTERS[0];
    const filtered = all.filter(filter.match);

    const column = COLUMNS.find((c) => c.key === sortKey) ?? COLUMNS[0];
    const sorted = [...filtered].sort((a, b) => compare(a, b, column.sort, sortDirection));
    // Stable secondary ordering keeps equal values from shuffling between renders.
    sorted.sort((a, b) => compare(a, b, COLUMNS[0].sort, 'desc'));

    const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    if (page > pageCount - 1) page = pageCount - 1;
    const start = page * PAGE_SIZE;
    const slice = sorted.slice(start, start + PAGE_SIZE);

    // Chronological context for per-row sparklines.
    const chrono = [...all].sort((a, b) => a.timestamp - b.timestamp);
    const chronoIndex = new Map(chrono.map((reading, index) => [rowKey(reading), index]));

    const rows = document.createDocumentFragment();
    slice.forEach((reading, offset) => {
      const position = chronoIndex.get(rowKey(reading)) ?? 0;
      const window = chrono.slice(Math.max(0, position - SPARK_WINDOW + 1), position + 1);
      rows.append(buildRow(reading, window, start + offset + 1));
    });
    tbody.replaceChildren(rows);

    const hasRows = sorted.length > 0;
    scroll.hidden = !hasRows;
    footer.hidden = !hasRows;
    empty.hidden = hasRows;
    if (!hasRows) {
      emptyTitle.textContent = all.length ? 'No readings match this filter' : 'No readings yet';
      emptyBody.textContent = all.length
        ? `All ${all.length} stored readings were filtered out. Clear the filter to see them again.`
        : 'Start the guided demo from the Demo tab, or connect a band and calibrate. Readings appear here as they arrive.';
    }

    pagerText.textContent = hasRows ? `${start + 1}–${Math.min(start + PAGE_SIZE, sorted.length)} of ${sorted.length}` : '';
    prevButton.disabled = following || page === 0;
    nextButton.disabled = following || page >= pageCount - 1;
    followButton.setAttribute('aria-pressed', String(following));
    followButton.textContent = following ? 'Following live' : 'Resume live';
    followButton.classList.toggle('is-active', following);

    newPill.hidden = following || unseen === 0;
    newPill.textContent = `${unseen} new ${unseen === 1 ? 'reading' : 'readings'}`;
  }

  return {
    setData(readings, nextBaseline) {
      const previousNewest = all.length ? Math.max(...all.map((r) => r.timestamp)) : 0;
      all = readings || [];
      baseline = nextBaseline;
      if (following) {
        page = 0;
      } else {
        const newest = all.length ? Math.max(...all.map((r) => r.timestamp)) : 0;
        unseen = Math.max(0, unseen + (newest > previousNewest ? 1 : 0));
      }
      render();
    },
    setFollowing(value) {
      following = value;
      if (following) {
        page = 0;
        unseen = 0;
      }
      render();
    },
    refresh: render
  };
}
