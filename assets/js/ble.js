/**
 * VFM BLE contract.
 *
 * Telemetry arrives as a single BLE notification. Two frame revisions exist:
 *
 *   v1 - 20 bytes, original contract (acoustic features + pulse rate).
 *   v2 - 22 bytes, v1 plus optical saturation and perfusion index.
 *
 * Both are accepted so that firmware which has not yet been updated keeps working;
 * a v1 frame simply reports no optical vitals.
 *
 * All multi-byte fields are little-endian.
 */

export const SERVICE_UUID = '3e5f0001-4c95-4b1a-9b35-9f31c2608c01';
export const TELEMETRY_UUID = '3e5f0002-4c95-4b1a-9b35-9f31c2608c01';
export const CONTROL_UUID = '3e5f0003-4c95-4b1a-9b35-9f31c2608c01';

export const FRAME = { LEGACY: 20, EXTENDED: 22 };
export const VERSION = { LEGACY: 1, EXTENDED: 2 };
export const SUPPORTED_VERSIONS = [VERSION.LEGACY, VERSION.EXTENDED];

/** Readings below this quality score are never used as evidence. */
export const QUALITY_MINIMUM = 70;

/** Control commands written to the optional haptic characteristic. */
export const CONTROL = { HAPTIC_PULSE: 1, HAPTIC_STOP: 2 };

/** Plausibility bounds. Values outside these are treated as absent, not as data. */
export const BOUNDS = {
  bpm: { min: 30, max: 220 },
  spo2: { min: 50, max: 100 },
  perfusionIndex: { min: 0, max: 100 }
};

export const FLAG = {
  CONTACT: 0b0001,
  PPG_VALID: 0b0010,
  FAULT: 0b0100,
  HAPTIC: 0b1000
};

export function hasFlag(packet, flag) {
  return Boolean(packet.flags & flag);
}

function inRange(value, bounds) {
  return Number.isInteger(value) && value >= bounds.min && value <= bounds.max;
}

/**
 * Decode a DataView into a normalised packet.
 *
 * Optical vitals (pulse rate, SpO2, perfusion index) are only trusted when the
 * firmware asserts the PPG-valid flag. Without that assertion the fields are
 * reported as `null` rather than as a plausible-looking number.
 */
export function parseTelemetry(view) {
  const length = view.byteLength;
  if (length !== FRAME.LEGACY && length !== FRAME.EXTENDED) {
    throw new Error(`Expected a ${FRAME.LEGACY}- or ${FRAME.EXTENDED}-byte VFM frame, received ${length} bytes.`);
  }

  const packet = {
    version: view.getUint8(0),
    sequence: view.getUint16(1, true),
    lowBandPower: view.getFloat32(3, true),
    highBandPower: view.getFloat32(7, true),
    amplitude: view.getFloat32(11, true),
    dominantFrequencyHz: view.getUint16(15, true),
    quality: view.getUint8(17),
    bpm: view.getUint8(18),
    flags: view.getUint8(19),
    spo2: length === FRAME.EXTENDED ? view.getUint8(20) : null,
    perfusionIndex: length === FRAME.EXTENDED ? view.getUint8(21) : null,
    timestamp: Date.now()
  };

  if (!SUPPORTED_VERSIONS.includes(packet.version)) {
    throw new Error(`Unsupported VFM telemetry version ${packet.version}.`);
  }

  // A v1-length frame can never carry optical vitals, even if it claims v2.
  if (length !== FRAME.EXTENDED) {
    packet.spo2 = null;
    packet.perfusionIndex = null;
  }

  packet.contact = hasFlag(packet, FLAG.CONTACT);
  packet.ppgValid = hasFlag(packet, FLAG.PPG_VALID);
  packet.faulty = hasFlag(packet, FLAG.FAULT);
  packet.hapticAvailable = hasFlag(packet, FLAG.HAPTIC);

  // Optical readings are only admissible behind a PPG-valid assertion.
  packet.bpm = packet.ppgValid && inRange(packet.bpm, BOUNDS.bpm) ? packet.bpm : null;
  packet.spo2 = packet.ppgValid && inRange(packet.spo2, BOUNDS.spo2) ? packet.spo2 : null;
  packet.perfusionIndex = inRange(packet.perfusionIndex, BOUNDS.perfusionIndex) ? packet.perfusionIndex : null;

  return packet;
}

/**
 * Encode a packet back into a frame. Used by the guided demo replay so that the
 * simulator exercises the exact same decode path as real hardware.
 */
export function makeFrame(packet) {
  const extended = packet.version === VERSION.EXTENDED;
  const buffer = new ArrayBuffer(extended ? FRAME.EXTENDED : FRAME.LEGACY);
  const view = new DataView(buffer);

  view.setUint8(0, packet.version);
  view.setUint16(1, packet.sequence, true);
  view.setFloat32(3, packet.lowBandPower, true);
  view.setFloat32(7, packet.highBandPower, true);
  view.setFloat32(11, packet.amplitude, true);
  view.setUint16(15, packet.dominantFrequencyHz, true);
  view.setUint8(17, packet.quality);
  view.setUint8(18, packet.bpm ?? 0);
  view.setUint8(19, packet.flags);
  if (extended) {
    view.setUint8(20, packet.spo2 ?? 0);
    view.setUint8(21, packet.perfusionIndex ?? 0);
  }
  return view;
}

/**
 * A reading is admissible as evidence only when it is well-formed, in contact,
 * above the quality floor, and free of device faults.
 */
export function isAdmissible(packet) {
  return (
    packet.version === VERSION.EXTENDED ||
    packet.version === VERSION.LEGACY
  ) &&
    Number.isFinite(packet.lowBandPower) &&
    Number.isFinite(packet.highBandPower) &&
    Number.isFinite(packet.amplitude) &&
    packet.lowBandPower > 0 &&
    packet.quality >= QUALITY_MINIMUM &&
    packet.contact &&
    !packet.faulty;
}

/** Connect to a VFM band and stream telemetry. Returns a handle with a stop(). */
export async function connectBand({ onPacket, onDisconnect, onStatus }) {
  if (!navigator.bluetooth) {
    throw new Error('Web Bluetooth is unavailable in this browser. Android Chrome over HTTPS is required, or use the guided demo.');
  }

  onStatus?.('pairing');
  const device = await navigator.bluetooth.requestDevice({ filters: [{ services: [SERVICE_UUID] }] });
  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(SERVICE_UUID);
  const telemetry = await service.getCharacteristic(TELEMETRY_UUID);

  // Haptics are optional; a band without the write characteristic still monitors.
  let control = null;
  try {
    control = await service.getCharacteristic(CONTROL_UUID);
  } catch {
    control = null;
  }

  telemetry.addEventListener('characteristicvaluechanged', (event) => {
    onPacket(event.target.value);
  });
  await telemetry.startNotifications();

  device.addEventListener('gattserverdisconnected', () => onDisconnect?.(), { once: true });
  onStatus?.('connected');

  return {
    device,
    name: device.name || 'VFM band',
    async sendControl(command) {
      if (!control) return false;
      const value = new Uint8Array([VERSION.EXTENDED, command]);
      try {
        if (control.writeValueWithoutResponse) await control.writeValueWithoutResponse(value);
        else await control.writeValue(value);
        return true;
      } catch {
        return false;
      }
    },
    stop() {
      try { telemetry.stopNotifications(); } catch { /* characteristic may already be gone */ }
      if (device.gatt?.connected) device.gatt.disconnect();
    }
  };
}
