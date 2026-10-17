// Unit tests for the BLE packet layer. ble.js has no DOM dependency at module scope.
import { parseTelemetry, makeFrame, isAdmissible, FRAME, VERSION, FLAG, BOUNDS } from '../assets/js/ble.js';

let pass = 0;
let fail = 0;

function check(name, condition, extra = '') {
  if (condition) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name} ${extra}`);
  }
}

function frame({ version = VERSION.EXTENDED, sequence = 7, low = 0.82, high = 1.02, amplitude = 0.84, freq = 150, quality = 94, bpm = 74, flags = 0b1011, spo2 = 97, pi = 15, bytes = null }) {
  const extended = bytes ?? (version === VERSION.EXTENDED ? FRAME.EXTENDED : FRAME.LEGACY);
  const buffer = new ArrayBuffer(extended);
  const view = new DataView(buffer);
  view.setUint8(0, version);
  view.setUint16(1, sequence, true);
  view.setFloat32(3, low, true);
  view.setFloat32(7, high, true);
  view.setFloat32(11, amplitude, true);
  view.setUint16(15, freq, true);
  view.setUint8(17, quality);
  view.setUint8(18, bpm);
  view.setUint8(19, flags);
  if (extended === FRAME.EXTENDED) {
    view.setUint8(20, spo2);
    view.setUint8(21, pi);
  }
  return view;
}

console.log('\nv2 frame (22 bytes)');
{
  const p = parseTelemetry(frame({}));
  check('version is 2', p.version === 2);
  check('decodes lowBandPower', Math.abs(p.lowBandPower - 0.82) < 1e-6);
  check('decodes highBandPower', Math.abs(p.highBandPower - 1.02) < 1e-6);
  check('decodes amplitude', Math.abs(p.amplitude - 0.84) < 1e-6);
  check('decodes dominantFrequencyHz', p.dominantFrequencyHz === 150);
  check('decodes quality', p.quality === 94);
  check('decodes bpm', p.bpm === 74);
  check('decodes spo2', p.spo2 === 97, `got ${p.spo2}`);
  check('decodes perfusionIndex', p.perfusionIndex === 15, `got ${p.perfusionIndex}`);
  check('contact flag set', p.contact === true);
  check('ppgValid flag set', p.ppgValid === true);
  check('fault clear', p.faulty === false);
  check('haptic available', p.hapticAvailable === true);
  check('is admissible', isAdmissible(p) === true);
}

console.log('\nv1 frame (20 bytes) — legacy firmware must not crash');
{
  const p = parseTelemetry(frame({ version: VERSION.LEGACY, bytes: FRAME.LEGACY }));
  check('version is 1', p.version === 1);
  check('spo2 is null', p.spo2 === null, `got ${p.spo2}`);
  check('perfusionIndex is null', p.perfusionIndex === null, `got ${p.perfusionIndex}`);
  check('bpm still decoded', p.bpm === 74);
  check('still admissible', isAdmissible(p) === true);
}

console.log('\nv1 length claiming v2 — optical bytes cannot be fabricated');
{
  const p = parseTelemetry(frame({ version: VERSION.EXTENDED, bytes: FRAME.LEGACY, spo2: 99, pi: 40 }));
  check('spo2 forced to null', p.spo2 === null, `got ${p.spo2}`);
  check('perfusionIndex forced to null', p.perfusionIndex === null, `got ${p.perfusionIndex}`);
}

console.log('\nPPG-valid gating');
{
  const p = parseTelemetry(frame({ flags: FLAG.CONTACT | FLAG.HAPTIC, spo2: 97, bpm: 74, pi: 15 }));
  check('ppgValid is false', p.ppgValid === false);
  check('spo2 suppressed', p.spo2 === null, `got ${p.spo2}`);
  check('bpm suppressed', p.bpm === null, `got ${p.bpm}`);
  check('perfusionIndex retained (not PPG-gated)', p.perfusionIndex === 15);
  check('still admissible acoustically', isAdmissible(p) === true);
}

console.log('\nout-of-range optical values are discarded, not clamped');
{
  const low = parseTelemetry(frame({ spo2: 42 }));
  check('spo2 42 rejected', low.spo2 === null, `got ${low.spo2}`);
  const high = parseTelemetry(frame({ spo2: 120 }));
  check('spo2 120 rejected (u8 wrap already handled)', high.spo2 === null, `got ${high.spo2}`);
  const absurd = parseTelemetry(frame({ bpm: 250 }));
  check('bpm 250 rejected', absurd.bpm === null, `got ${absurd.bpm}`);
  const zero = parseTelemetry(frame({ bpm: 0 }));
  check('bpm 0 rejected (was "pending" in v1 code)', zero.bpm === null, `got ${zero.bpm}`);
}

console.log('\nadmissibility gates');
{
  check('quality below floor rejected', isAdmissible(parseTelemetry(frame({ quality: 69 }))) === false);
  check('quality at floor accepted', isAdmissible(parseTelemetry(frame({ quality: 70 }))) === true);
  check('no contact rejected', isAdmissible(parseTelemetry(frame({ flags: FLAG.PPG_VALID | FLAG.HAPTIC }))) === false);
  check('device fault rejected', isAdmissible(parseTelemetry(frame({ flags: FLAG.CONTACT | FLAG.PPG_VALID | FLAG.FAULT }))) === false);
  check('zero low-band power rejected', isAdmissible(parseTelemetry(frame({ low: 0 }))) === false);
}

console.log('\nmalformed frames throw rather than silently producing zeros');
{
  for (const bytes of [19, 21, 23, 0]) {
    let threw = false;
    try { parseTelemetry(new DataView(new ArrayBuffer(bytes))); } catch { threw = true; }
    check(`${bytes}-byte frame rejected`, threw);
  }
  let threw = false;
  try { parseTelemetry(frame({ version: 9 })); } catch { threw = true; }
  check('unknown protocol version rejected', threw);
}

console.log('\nround trip through the encoder used by replay');
{
  const original = { version: VERSION.EXTENDED, sequence: 4242, lowBandPower: 0.777, highBandPower: 1.234, amplitude: 0.55, dominantFrequencyHz: 333, quality: 88, bpm: 91, spo2: 94, perfusionIndex: 7, flags: 0b1011 };
  const decoded = parseTelemetry(makeFrame(original));
  check('length is 22', makeFrame(original).byteLength === FRAME.EXTENDED);
  check('sequence survives', decoded.sequence === 4242);
  check('lowBandPower survives', Math.abs(decoded.lowBandPower - 0.777) < 1e-6);
  check('highBandPower survives', Math.abs(decoded.highBandPower - 1.234) < 1e-6);
  check('spo2 survives', decoded.spo2 === 94);
  check('pi survives', decoded.perfusionIndex === 7);

  const legacy = parseTelemetry(makeFrame({ ...original, version: VERSION.LEGACY, spo2: null, perfusionIndex: null }));
  check('v1 encode yields 20 bytes', makeFrame({ ...original, version: VERSION.LEGACY }).byteLength === FRAME.LEGACY);
  check('v1 round trip has no optical', legacy.spo2 === null && legacy.perfusionIndex === null);
}

console.log('\nbounds table sanity');
check('spo2 bounds are 50-100', BOUNDS.spo2.min === 50 && BOUNDS.spo2.max === 100);
check('bpm bounds are 30-220', BOUNDS.bpm.min === 30 && BOUNDS.bpm.max === 220);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
