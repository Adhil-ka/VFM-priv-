/**
 * Decode-scramble text.
 *
 * Used sparingly, and only when the operational state actually changes: the label
 * resolves out of a glyph pool, character by character, left to right. Applied to
 * every status string it would be noise; applied to state transitions it reads as
 * the instrument re-locking onto a new mode.
 */

import { motion } from '../theme.js';

const POOL = '▚▞█▓▒░01/\\|<>+-*=#$%&@ABCDEFGHJKLMNPQRSTUVWXYZ';

const running = new WeakMap();

export function scrambleTo(node, text, { duration = 620 } = {}) {
  if (!node) return;
  const previous = running.get(node);
  if (previous) cancelAnimationFrame(previous);

  const target = String(text ?? '');

  if (motion.reduced || target.length === 0) {
    node.textContent = target;
    return;
  }

  const chars = [...target];
  const glyphs = [...chars];
  // Characters that carry no meaning are left alone rather than scrambled.
  const lockable = chars.map((char) => /\S/.test(char));
  const total = lockable.filter(Boolean).length;
  let locked = 0;
  const start = performance.now();

  function step(now) {
    const elapsed = now - start;
    const progress = Math.min(1, elapsed / duration);
    // Ease the scramble down so the tail settles rather than stopping abruptly.
    const density = 1 - progress;

    for (let i = 0; i < chars.length; i += 1) {
      if (!lockable[i]) {
        glyphs[i] = chars[i];
        continue;
      }
      if (progress >= locked / total && Math.random() < density) {
        glyphs[i] = chars[i];
        locked += 1;
      } else if (glyphs[i] !== chars[i]) {
        glyphs[i] = POOL[Math.floor(Math.random() * POOL.length)];
      }
    }

    node.textContent = glyphs.join('');
    if (progress < 1) {
      running.set(node, requestAnimationFrame(step));
    } else {
      node.textContent = target;
      running.delete(node);
    }
  }

  running.set(node, requestAnimationFrame(step));
}

export function scrambleNow(node, text) {
  if (!node) return;
  const previous = running.get(node);
  if (previous) cancelAnimationFrame(previous);
  running.delete(node);
  node.textContent = String(text ?? '');
}
