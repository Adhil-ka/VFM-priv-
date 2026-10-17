/**
 * View router.
 *
 * Hash-based so every view is linkable and the browser back button behaves. On
 * browsers with the View Transitions API the swap is cross-faded by the platform
 * rather than by a hand-rolled animation; everywhere else it degrades to an
 * instant, correct swap.
 *
 * Auto-animate handles continuous DOM mutation (event insertion, table re-sort);
 * view switching deliberately does not go through it, because toggling one
 * element's visibility is not the kind of change FLIP animation is good at.
 */

import { motion } from './theme.js';

export const VIEWS = [
  { key: 'monitor', label: 'Monitor', hint: 'Live status, vital readouts and the flow trace' },
  { key: 'readings', label: 'Readings', hint: 'Every admissible reading in a sortable table' },
  { key: 'signals', label: 'Signals', hint: 'Spectral balance, perfusion and band contact' },
  { key: 'events', label: 'Events', hint: 'What VFM has done, and why' },
  { key: 'demo', label: 'Demo', hint: 'Guided scenarios for presentation' }
];

const DEFAULT_VIEW = 'monitor';

function viewFromHash() {
  const key = location.hash.replace(/^#\/?/, '');
  return VIEWS.some((view) => view.key === key) ? key : DEFAULT_VIEW;
}

export function createRouter({ root, nav, onChange }) {
  const sections = new Map();
  for (const section of root.querySelectorAll('[data-view]')) {
    sections.set(section.dataset.view, section);
  }
  const buttons = new Map();
  for (const button of nav.querySelectorAll('[data-nav]')) {
    buttons.set(button.dataset.nav, button);
  }

  let current = null;

  // Moving focus to the new view's heading announces the change to screen readers.
  // That programmatic focus should only *look* like focus when the user is actually
  // navigating by keyboard, otherwise every mouse click leaves a stray outline.
  let keyboardDriven = false;
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Tab' || event.key === 'Enter' || event.key === ' ' || event.key.startsWith('Arrow')) {
      keyboardDriven = true;
    }
  }, true);
  document.addEventListener('pointerdown', () => { keyboardDriven = false; }, true);

  function apply(key, { moveFocus = true } = {}) {
    if (!sections.has(key)) key = DEFAULT_VIEW;
    if (key === current) return;

    const showFocusRing = keyboardDriven;

    const commit = () => {
      for (const [name, section] of sections) {
        const active = name === key;
        section.hidden = !active;
        section.classList.toggle('is-active', active);
        // Inert removes hidden views from the tab order entirely.
        section.toggleAttribute('inert', !active);
      }
      for (const [name, button] of buttons) {
        const active = name === key;
        button.classList.toggle('is-active', active);
        if (active) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
      }
      // Note: deliberately `data-active-view`, not `data-view` — the view sections
      // are selected by `[data-view]`, and reusing it here would make the host
      // itself look like a view.
      root.dataset.activeView = key;
      current = key;

      if (moveFocus) {
        const heading = sections.get(key)?.querySelector('[data-view-heading]');
        if (heading) {
          heading.setAttribute('tabindex', '-1');
          heading.focus({ preventScroll: true });
          heading.classList.toggle('show-ring', showFocusRing);
        }
        window.scrollTo({ top: 0, behavior: motion.reduced ? 'auto' : 'smooth' });
      }
      onChange?.(key);
    };

    if (motion.reduced || !document.startViewTransition) {
      commit();
      return;
    }

    // Rapid navigation supersedes the in-flight transition, which rejects with an
    // AbortError. The update callback has already run by then, so the swap still
    // happens — these rejections are expected and just need swallowing, or they
    // surface as unhandled promise rejections.
    const transition = document.startViewTransition(commit);
    transition.ready?.catch(() => undefined);
    transition.finished?.catch(() => undefined);
    transition.updateCallbackDone?.catch(() => undefined);
  }

  nav.addEventListener('click', (event) => {
    const button = event.target.closest('[data-nav]');
    if (!button) return;
    event.preventDefault();
    location.hash = `#/${button.dataset.nav}`;
  });

  window.addEventListener('hashchange', () => apply(viewFromHash()));

  // Honour a deep link on first load without stealing focus from the page.
  apply(viewFromHash(), { moveFocus: false });

  return {
    get current() {
      return current;
    },
    go(key) {
      location.hash = `#/${key}`;
    },
    refresh() {
      onChange?.(current);
    }
  };
}
