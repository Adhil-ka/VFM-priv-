/**
 * Event seismograph.
 *
 * A compact strip showing recent system activity: one spike per event, height and
 * colour by severity. It gives the event log a shape you can read at a glance,
 * rather than a flat list of timestamps.
 */

const HEIGHT = 68;
const PADDING = 6;
const WEIGHT = { neutral: 0.22, good: 0.4, nominal: 0.4, watch: 0.68, alert: 1 };

function token(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
}

export function createSeismograph({ canvas, capacity = 20 } = {}) {
  const context = canvas.getContext('2d');
  let events = [];
  let box = { width: 0, height: HEIGHT };

  function measure() {
    const rect = canvas.getBoundingClientRect();
    box = { width: rect.width, height: rect.height || HEIGHT };
    const scale = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.max(1, Math.floor(rect.width * scale));
    canvas.height = Math.max(1, Math.floor(box.height * scale));
    context.setTransform(scale, 0, 0, scale, 0, 0);
  }

  function render() {
    if (!box.width || !box.height) return;
    context.clearRect(0, 0, box.width, box.height);

    const floor = box.height - PADDING;
    context.strokeStyle = token('grid');
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(0, Math.round(floor) + 0.5);
    context.lineTo(box.width, Math.round(floor) + 0.5);
    context.stroke();

    if (!events.length) {
      context.fillStyle = token('muted');
      context.font = '10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText('No activity recorded', box.width / 2, box.height / 2);
      return;
    }

    const shown = events.slice(-capacity);
    const slot = box.width / Math.max(shown.length, 1);
    const barWidth = Math.max(3, Math.min(14, slot * 0.42));
    const reach = floor - PADDING;

    shown.forEach((event, index) => {
      const weight = WEIGHT[event.tone] ?? WEIGHT.neutral;
      const x = index * slot + slot / 2;
      const height = Math.max(3, reach * weight);
      const tone =
        event.tone === 'alert' ? 'alert' : event.tone === 'watch' ? 'watch' : event.tone === 'good' || event.tone === 'nominal' ? 'nominal' : 'line-strong';

      context.save();
      if (event.tone === 'alert') {
        context.shadowColor = token('alert');
        context.shadowBlur = 9;
      }
      context.fillStyle = tone === 'line-strong' ? token('muted') : token(tone);
      context.globalAlpha = 0.45 + weight * 0.55;
      context.fillRect(Math.round(x - barWidth / 2), Math.round(floor - height), Math.round(barWidth), Math.round(height));
      context.restore();
    });
  }

  const observer = new ResizeObserver(() => {
    measure();
    render();
  });
  observer.observe(canvas);

  const paletteObserver = new MutationObserver(() => render());
  paletteObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  return {
    setData(next) {
      events = next || [];
      measure();
      render();
    },
    refresh: render,
    destroy() {
      observer.disconnect();
      paletteObserver.disconnect();
    }
  };
}
