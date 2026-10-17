/**
 * Inline sparkline.
 *
 * Rendered as an SVG polyline rather than a canvas: the table mounts dozens of
 * these at once, and an SVG per row stays crisp at any density while costing
 * nothing to redraw on scroll.
 */

const NS = 'http://www.w3.org/2000/svg';

export function createSparkline({ width = 68, height = 20, values = [], tone = 'accent', threshold = null } = {}) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', `spark spark-${tone}`);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  const clean = values.filter(Number.isFinite);
  if (clean.length < 2) {
    svg.dataset.empty = 'true';
    return svg;
  }

  let min = Math.min(...clean);
  let max = Math.max(...clean);
  if (Number.isFinite(threshold)) {
    min = Math.min(min, threshold);
    max = Math.max(max, threshold);
  }
  const span = Math.max(max - min, 0.0001);
  const inset = 2;
  const usable = height - inset * 2;
  const toY = (value) => inset + (1 - (value - min) / span) * usable;
  const toX = (index) => (index / (clean.length - 1)) * width;

  const points = clean.map((value, index) => `${toX(index).toFixed(1)},${toY(value).toFixed(1)}`);

  if (Number.isFinite(threshold)) {
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', '0');
    line.setAttribute('x2', String(width));
    line.setAttribute('y1', toY(threshold).toFixed(1));
    line.setAttribute('y2', toY(threshold).toFixed(1));
    line.setAttribute('class', 'spark-threshold');
    svg.append(line);
  }

  const line = document.createElementNS(NS, 'polyline');
  line.setAttribute('points', points.join(' '));
  line.setAttribute('class', 'spark-line');
  svg.append(line);

  const head = document.createElementNS(NS, 'circle');
  head.setAttribute('cx', toX(clean.length - 1).toFixed(1));
  head.setAttribute('cy', toY(clean[clean.length - 1]).toFixed(1));
  head.setAttribute('r', '1.8');
  head.setAttribute('class', 'spark-head');
  svg.append(head);

  return svg;
}
