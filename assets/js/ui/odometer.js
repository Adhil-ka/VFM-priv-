/**
 * Odometer digit roll.
 *
 * Numbers in a monitoring instrument should not flicker between digits on every
 * frame. Each digit lives in a masked cell with a vertical strip of 0-9 beneath it;
 * a change translates the strip so the new glyph rises into view, staggered from
 * the least significant digit. This is mechanical-counter behaviour, built from
 * transforms rather than an animation library.
 *
 * Supports a fixed number of decimal places, because the primary flow ratio is a
 * three-decimal quantity and rounding it to a whole number would be a lie.
 */

import { motion } from '../theme.js';

const GLYPHS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const BLANK = ' ';

export function createOdometer(host, { digits = 3, decimals = 0 } = {}) {
  let strips = [];
  let layoutKey = null;

  function build(decimalsWanted) {
    const intDigits = Math.max(1, digits - decimalsWanted);
    const key = `${intDigits}:${decimalsWanted}`;
    if (key === layoutKey) return;
    layoutKey = key;

    host.replaceChildren();
    // Must be reset here. Without this, a relayout leaves the previous layout's
    // detached strips in the array, so the index-to-digit mapping goes wrong and
    // every visible cell resolves to blank.
    strips = [];
    const group = document.createElement('span');
    group.className = 'odo-digits';

    const makeCell = () => {
      const cell = document.createElement('span');
      cell.className = 'odo-cell';
      const strip = document.createElement('span');
      strip.className = 'odo-strip';
      for (const glyph of GLYPHS) {
        const item = document.createElement('span');
        item.className = 'odo-glyph';
        item.textContent = glyph;
        strip.append(item);
      }
      // Leading blank so the strip can travel through a full cycle.
      const lead = document.createElement('span');
      lead.className = 'odo-glyph odo-blank';
      lead.textContent = BLANK;
      strip.prepend(lead);
      cell.append(strip);
      strips.push(strip);
      return cell;
    };

    for (let i = 0; i < intDigits; i += 1) group.append(makeCell());

    if (decimalsWanted > 0) {
      const dot = document.createElement('span');
      dot.className = 'odo-dot';
      dot.textContent = '.';
      group.append(dot);
      for (let i = 0; i < decimalsWanted; i += 1) group.append(makeCell());
    }

    host.append(group);
  }

  function apply(next, { animate = true } = {}) {
    if (next == null || !Number.isFinite(Number(next))) {
      host.dataset.empty = 'true';
      // Still lay out the digits so the card does not resize when data arrives.
      build(0);
      strips.forEach((strip) => {
        strip.style.transitionDelay = '0ms';
        strip.style.transform = 'translateY(-1em)';
      });
      return;
    }
    host.dataset.empty = 'false';

    const decimalsWanted = decimals;
    build(decimalsWanted);

    const [intPart, decPart = ''] = Number(next).toFixed(decimalsWanted).split('.');
    const intCells = strips.length - decimalsWanted;

    // An over-long integer part keeps its most significant digits; silently
    // clipping a leading digit would misreport the magnitude.
    const intText = intPart.length > intCells ? intPart.slice(0, intCells) : intPart.padStart(intCells, ' ');
    const digitsOnly = [...intText, ...decPart.padStart(decimalsWanted, ' ')];

    strips.forEach((strip, i) => {
      const glyph = digitsOnly[i];
      const index = glyph != null && GLYPHS.indexOf(glyph) >= 0 ? GLYPHS.indexOf(glyph) : -1;
      const target = index < 0 ? -1 : index + 1;
      // Least significant digit leads, so the eye reads the change left-to-right.
      const delay = animate && !motion.reduced ? (strips.length - 1 - i) * 34 : 0;
      strip.style.transitionDelay = `${delay}ms`;
      strip.style.transform = `translateY(${-target}em)`;
    });
  }

  function bloom() {
    if (motion.reduced) return;
    host.classList.remove('is-bloom');
    // Force reflow so the animation restarts on rapid consecutive updates.
    void host.offsetWidth;
    host.classList.add('is-bloom');
    setTimeout(() => host.classList.remove('is-bloom'), 720);
  }

  build(decimals);

  return {
    apply,
    bloom,
    /** Change the decimal places, rebuilding the layout if it differs. */
    setFormat(nextDecimals) {
      if (nextDecimals === decimals) return;
      decimals = nextDecimals;
      layoutKey = null;
      build(decimals);
    }
  };
}
