/**
 * Transient notifications.
 *
 * Deliberately not an alert channel: alerts use the modal acknowledgement flow.
 * These are confirmations and advisories only.
 */

import { el } from '../format.js';
import { motion } from '../theme.js';

const MAX_VISIBLE = 3;
const LIFETIME = 4600;

let host = null;

function ensureHost() {
  if (host && document.body.contains(host)) return host;
  host = el('div', 'toast-stack');
  host.setAttribute('role', 'status');
  host.setAttribute('aria-live', 'polite');
  document.body.append(host);
  return host;
}

export function toast(message, tone = 'neutral', { icon = null, duration = LIFETIME } = {}) {
  const root = ensureHost();

  const node = el('div', `toast toast-${tone}`);
  if (icon) {
    const badge = el('span', 'toast-icon', icon);
    badge.setAttribute('aria-hidden', 'true');
    node.append(badge);
  }
  node.append(el('p', 'toast-body', message));
  root.append(node);

  while (root.children.length > MAX_VISIBLE) root.firstElementChild?.remove();

  requestAnimationFrame(() => node.classList.add('is-visible'));

  const dismiss = () => {
    node.classList.remove('is-visible');
    const remove = () => node.remove();
    if (motion.reduced) remove();
    else setTimeout(remove, 260);
  };

  const timer = setTimeout(dismiss, duration);
  node.addEventListener('click', () => {
    clearTimeout(timer);
    dismiss();
  });

  return dismiss;
}
