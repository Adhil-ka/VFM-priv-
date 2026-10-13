const VFM_SERVICE_UUID = '3e5f0001-4c95-4b1a-9b35-9f31c2608c01';
const VFM_TELEMETRY_UUID = '3e5f0002-4c95-4b1a-9b35-9f31c2608c01';
const VFM_CONTROL_UUID = '3e5f0003-4c95-4b1a-9b35-9f31c2608c01';
const FRAME_BYTES = 20;
const PROTOCOL_VERSION = 1;
const QUALITY_MINIMUM = 70;
const READING_LIMIT = 1000;

const TIMING = {
  live: { calibrationSamples: 60, recheckMs: 60_000, recheckValidSamples: 60, recheckAnomalies: 45, alertMs: 300_000 },
  demo: { calibrationSamples: 10, recheckMs: 10_000, recheckValidSamples: 10, recheckAnomalies: 8, alertMs: 15_000 }
};

const $ = (id) => document.getElementById(id);
const elements = {
  connectionPill: $('connectionPill'), connectBtn: $('connectBtn'), stateDot: $('stateDot'), stateLabel: $('stateLabel'), stateDetail: $('stateDetail'),
  profileForm: $('profileForm'), patientAlias: $('patientAlias'), accessSide: $('accessSide'), savedProfile: $('savedProfile'),
  baselineBadge: $('baselineBadge'), calibrationCopy: $('calibrationCopy'), calibrationTrack: $('calibrationTrack'), calibrationProgress: $('calibrationProgress'), calibrationStatus: $('calibrationStatus'), calibrateBtn: $('calibrateBtn'),
  currentRatio: $('currentRatio'), baselineValue: $('baselineValue'), thresholdText: $('thresholdText'), deltaValue: $('deltaValue'), deltaText: $('deltaText'),
  qualityValue: $('qualityValue'), qualityText: $('qualityText'), sourceBadge: $('sourceBadge'), trendCanvas: $('trendCanvas'), chartDescription: $('chartDescription'),
  contactBadge: $('contactBadge'), qualityFill: $('qualityFill'), placementGuidance: $('placementGuidance'), eventTimeline: $('eventTimeline'),
  stopDemoBtn: $('stopDemoBtn'), exportBtn: $('exportBtn'), resetBtn: $('resetBtn'), apiStatus: $('apiStatus'),
  alertDialog: $('alertDialog'), alertEvidence: $('alertEvidence'), safetyCountdown: $('safetyCountdown'), acknowledgeBtn: $('acknowledgeBtn'), repositionBtn: $('repositionBtn'), toast: $('toast')
};

function id() { return crypto.randomUUID ? crypto.randomUUID() : `vfm-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function median(values) { const list = [...values].sort((a, b) => a - b); const middle = Math.floor(list.length / 2); return list.length % 2 ? list[middle] : (list[middle - 1] + list[middle]) / 2; }
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function formatClock(date = new Date()) { return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date); }
function formatPercent(value) { return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`; }
function delayLabel(milliseconds) { const seconds = Math.max(0, Math.ceil(milliseconds / 1000)); return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`; }
function toneClass(tone) { return tone === 'good' ? 'is-good' : tone === 'watch' ? 'is-watch' : tone === 'alert' ? 'is-alert' : 'is-neutral'; }

class VfmStore {
  constructor() { this.db = null; }

  async open() {
    if (this.db) return this.db;
    this.db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('vfm-local', 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        database.createObjectStore('profile', { keyPath: 'id' });
        database.createObjectStore('baseline', { keyPath: 'id' });
        const readings = database.createObjectStore('readings', { keyPath: 'id', autoIncrement: true });
        readings.createIndex('timestamp', 'timestamp');
        database.createObjectStore('events', { keyPath: 'id' });
        database.createObjectStore('alerts', { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return this.db;
  }

  async get(storeName, key) {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const request = database.transaction(storeName, 'readonly').objectStore(storeName).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getAll(storeName) {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const request = database.transaction(storeName, 'readonly').objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async put(storeName, value) {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const request = database.transaction(storeName, 'readwrite').objectStore(storeName).put(value);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async add(storeName, value) {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const request = database.transaction(storeName, 'readwrite').objectStore(storeName).add(value);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async pruneReadings() {
    const records = await this.getAll('readings');
    if (records.length <= READING_LIMIT) return;
    records.sort((a, b) => a.timestamp - b.timestamp);
    const surplus = records.slice(0, records.length - READING_LIMIT);
    const database = await this.open();
    const transaction = database.transaction('readings', 'readwrite');
    surplus.forEach((record) => transaction.objectStore('readings').delete(record.id));
  }

  async clear() {
    const database = await this.open();
    await Promise.all(['profile', 'baseline', 'readings', 'events', 'alerts'].map((storeName) => new Promise((resolve, reject) => {
      const request = database.transaction(storeName, 'readwrite').objectStore(storeName).clear();
      request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
    })));
  }
}

const store = new VfmStore();
const state = {
  source: 'live', connection: 'disconnected', operational: 'READY', profile: { id: 'current', patientAlias: 'VFM Demo Patient', accessSide: 'Left' },
  baseline: null, calibration: null, readings: [], events: [], activeAlert: null, recheck: null,
  device: null, server: null, telemetry: null, control: null, simulator: null, demo: null,
  alertInterval: null, recheckInterval: null, toastTimeout: null, lastPacketAt: 0, lastGoodPacketAt: 0
};

function setPill(element, label, tone = 'neutral') {
  element.textContent = label;
  element.className = `status-pill ${toneClass(tone)}`;
}

function setOperational(next, label, detail, tone = 'neutral') {
  state.operational = next;
  elements.stateLabel.textContent = label;
  elements.stateDetail.textContent = detail;
  elements.stateDot.className = `state-dot ${toneClass(tone)}`;
}

function toast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('is-visible');
  clearTimeout(state.toastTimeout);
  state.toastTimeout = setTimeout(() => elements.toast.classList.remove('is-visible'), 3600);
}

async function addEvent(message, tone = 'system', persist = true) {
  const event = { id: id(), message, tone, timestamp: Date.now() };
  state.events.unshift(event); state.events = state.events.slice(0, 20);
  renderTimeline();
  if (persist) { try { await store.put('events', event); } catch { /* local history is best effort */ } }
}

function renderTimeline() {
  elements.eventTimeline.replaceChildren();
  if (!state.events.length) {
    const item = document.createElement('li'); item.className = 'event-item event-system'; item.innerHTML = '<time>Now</time><p>VFM is ready. Pair a band or start the guided demo.</p>';
    elements.eventTimeline.append(item); return;
  }
  state.events.slice(0, 8).forEach((event) => {
    const item = document.createElement('li'); item.className = `event-item event-${event.tone}`;
    const time = document.createElement('time'); time.textContent = formatClock(new Date(event.timestamp));
    const message = document.createElement('p'); message.textContent = event.message;
    item.append(time, message); elements.eventTimeline.append(item);
  });
}

function isContact(packet) { return Boolean(packet.flags & 0b0001); }
function hasFault(packet) { return Boolean(packet.flags & 0b0100); }
function hasHaptic(packet) { return Boolean(packet.flags & 0b1000); }
function isValid(packet) {
  return packet.version === PROTOCOL_VERSION && Number.isFinite(packet.lowBandPower) && Number.isFinite(packet.highBandPower) && Number.isFinite(packet.amplitude) && packet.lowBandPower > 0 && packet.quality >= QUALITY_MINIMUM && isContact(packet) && !hasFault(packet);
}

function parseTelemetry(view) {
  if (view.byteLength !== FRAME_BYTES) throw new Error(`Expected ${FRAME_BYTES}-byte VFM telemetry, received ${view.byteLength}.`);
  const packet = {
    version: view.getUint8(0), sequence: view.getUint16(1, true), lowBandPower: view.getFloat32(3, true), highBandPower: view.getFloat32(7, true),
    amplitude: view.getFloat32(11, true), dominantFrequencyHz: view.getUint16(15, true), quality: view.getUint8(17), bpm: view.getUint8(18), flags: view.getUint8(19), timestamp: Date.now()
  };
  if (packet.version !== PROTOCOL_VERSION) throw new Error(`Unsupported VFM telemetry version ${packet.version}.`);
  return packet;
}

function makeDemoFrame(packet) {
  const buffer = new ArrayBuffer(FRAME_BYTES); const view = new DataView(buffer);
  view.setUint8(0, PROTOCOL_VERSION); view.setUint16(1, packet.sequence, true); view.setFloat32(3, packet.lowBandPower, true); view.setFloat32(7, packet.highBandPower, true);
  view.setFloat32(11, packet.amplitude, true); view.setUint16(15, packet.dominantFrequencyHz, true); view.setUint8(17, packet.quality); view.setUint8(18, packet.bpm); view.setUint8(19, packet.flags);
  return view;
}

function updateSignal(packet, valid) {
  const quality = clamp(packet.quality || 0, 0, 100);
  elements.qualityValue.textContent = `${quality}%`;
  elements.qualityFill.style.width = `${quality}%`;
  if (hasFault(packet)) {
    elements.qualityText.textContent = 'Band reported a sensor issue'; elements.qualityFill.style.background = '#ce4660';
    setPill(elements.contactBadge, 'Sensor issue', 'alert'); elements.placementGuidance.textContent = 'Check the band and sensor connection, then try again.';
  } else if (!isContact(packet)) {
    elements.qualityText.textContent = 'No reliable skin contact'; elements.qualityFill.style.background = '#d49a37';
    setPill(elements.contactBadge, 'Reposition band', 'watch'); elements.placementGuidance.textContent = 'Reposition the acoustic sensor over the access site, then hold still.';
  } else if (packet.quality < QUALITY_MINIMUM) {
    elements.qualityText.textContent = 'Signal is too noisy to assess'; elements.qualityFill.style.background = '#d49a37';
    setPill(elements.contactBadge, 'Improve signal', 'watch'); elements.placementGuidance.textContent = 'Keep your arm still and secure the band before continuing.';
  } else {
    elements.qualityText.textContent = `Good contact · ${packet.bpm ? `${packet.bpm} BPM` : 'PPG pending'}`; elements.qualityFill.style.background = '#31a26d';
    setPill(elements.contactBadge, 'Good signal', 'good'); elements.placementGuidance.textContent = valid ? 'Signal quality is suitable for personal baseline monitoring.' : 'Waiting for a valid reading.';
  }
}

function renderMetrics(packet, ratio, anomaly = null) {
  elements.currentRatio.textContent = Number.isFinite(ratio) ? ratio.toFixed(3) : '—';
  if (!state.baseline) return;
  const delta = ((ratio - state.baseline.ratio) / state.baseline.ratio) * 100;
  elements.baselineValue.textContent = state.baseline.ratio.toFixed(3);
  elements.thresholdText.textContent = `Alert threshold ${state.baseline.thresholdRatio.toFixed(3)}`;
  elements.deltaValue.textContent = formatPercent(delta);
  elements.deltaValue.className = anomaly?.isAnomalous ? 'is-alert' : delta > 0 ? 'is-watch' : 'is-good';
  if (anomaly?.isAnomalous) elements.deltaText.textContent = anomaly.reason;
  else elements.deltaText.textContent = 'Within your personal range';
}

function drawChart() {
  const canvas = elements.trendCanvas; const rect = canvas.getBoundingClientRect(); const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * ratio)); canvas.height = Math.max(1, Math.floor(rect.height * ratio));
  const context = canvas.getContext('2d'); context.scale(ratio, ratio);
  const width = rect.width; const height = rect.height; const padding = { left: 35, right: 11, top: 14, bottom: 25 };
  context.clearRect(0, 0, width, height); context.font = '10px system-ui'; context.textBaseline = 'middle';
  const records = state.readings.slice(-60); const threshold = state.baseline?.thresholdRatio;
  if (!records.length) { context.fillStyle = '#708386'; context.textAlign = 'center'; context.fillText('Awaiting VFM readings', width / 2, height / 2); elements.chartDescription.textContent = 'No readings yet.'; return; }
  const values = records.map((reading) => reading.ratio).concat(Number.isFinite(threshold) ? [threshold] : []);
  const min = Math.max(0, Math.min(...values) * .9); const max = Math.max(min + .12, Math.max(...values) * 1.1); const plotWidth = width - padding.left - padding.right; const plotHeight = height - padding.top - padding.bottom;
  const y = (value) => padding.top + (max - value) / (max - min) * plotHeight; const x = (index) => padding.left + (records.length === 1 ? plotWidth / 2 : index / (records.length - 1) * plotWidth);
  context.strokeStyle = '#e1eae8'; context.lineWidth = 1; context.fillStyle = '#708386'; context.textAlign = 'right';
  for (let line = 0; line <= 3; line += 1) { const value = min + (max - min) * (line / 3); const lineY = y(value); context.beginPath(); context.moveTo(padding.left, lineY); context.lineTo(width - padding.right, lineY); context.stroke(); context.fillText(value.toFixed(2), padding.left - 6, lineY); }
  if (Number.isFinite(threshold)) { context.setLineDash([5, 4]); context.strokeStyle = '#b4233d'; context.beginPath(); context.moveTo(padding.left, y(threshold)); context.lineTo(width - padding.right, y(threshold)); context.stroke(); context.setLineDash([]); }
  context.strokeStyle = '#087c78'; context.lineWidth = 2.5; context.beginPath(); records.forEach((reading, index) => index ? context.lineTo(x(index), y(reading.ratio)) : context.moveTo(x(index), y(reading.ratio))); context.stroke();
  const recent = records[records.length - 1]; context.fillStyle = recent.anomalous ? '#b4233d' : '#087c78'; context.beginPath(); context.arc(x(records.length - 1), y(recent.ratio), 3.5, 0, Math.PI * 2); context.fill();
  context.fillStyle = '#708386'; context.textAlign = 'left'; context.fillText('Earlier', padding.left, height - 8); context.textAlign = 'right'; context.fillText('Now', width - padding.right, height - 8);
  elements.chartDescription.textContent = `Current flow pattern ratio ${recent.ratio.toFixed(3)}${threshold ? `; personal threshold ${threshold.toFixed(3)}` : ''}.`;
}

function renderCalibration() {
  const config = TIMING[state.source]; const calibration = state.calibration;
  const collected = calibration?.samples.length || 0; const goal = calibration?.goal || config.calibrationSamples;
  const progress = Math.round((collected / goal) * 100);
  elements.calibrationProgress.style.width = `${progress}%`; elements.calibrationTrack.setAttribute('aria-valuenow', String(collected)); elements.calibrationTrack.setAttribute('aria-valuemax', String(goal));
  if (state.baseline && !calibration) {
    setPill(elements.baselineBadge, 'Baseline ready', 'good'); elements.calibrationStatus.textContent = `${state.baseline.sampleCount} quality readings saved locally`;
    elements.calibrationCopy.textContent = `Your personal ratio baseline is ${state.baseline.ratio.toFixed(3)}. Recalibrate only when your usual flow pattern is stable.`; elements.calibrateBtn.disabled = false; elements.calibrateBtn.textContent = 'Recalibrate'; return;
  }
  if (calibration) {
    setPill(elements.baselineBadge, 'Calibrating', 'watch'); elements.calibrationStatus.textContent = `${collected} of ${goal} quality readings collected`;
    elements.calibrationCopy.textContent = `Hold still with good band contact. ${goal - collected} eligible readings remain.`; elements.calibrateBtn.disabled = true; elements.calibrateBtn.textContent = 'Calibrating…'; return;
  }
  setPill(elements.baselineBadge, 'Not calibrated', 'neutral'); elements.calibrationStatus.textContent = `0 of ${goal} quality readings collected`;
  elements.calibrationCopy.textContent = state.source === 'demo' ? 'Start the 10-second accelerated demo calibration.' : 'Connect the band, stay still, and begin a 60-second quality-checked calibration.';
  elements.calibrateBtn.disabled = state.connection !== 'connected' && !state.simulator; elements.calibrateBtn.textContent = 'Start calibration';
}

function buildBaseline(samples) {
  const ratios = samples.map((sample) => sample.ratio); const amplitudes = samples.map((sample) => sample.amplitude);
  const ratio = median(ratios); const amplitude = median(amplitudes); const mad = median(ratios.map((value) => Math.abs(value - ratio))); const sigma = 1.4826 * mad;
  const thresholdRatio = ratio * (1 + Math.max(.021, (3 * sigma) / Math.max(ratio, .000001)));
  return { id: 'current', ratio, amplitude, mad, sigma, thresholdRatio, amplitudeThreshold: amplitude * .7, sampleCount: samples.length, createdAt: Date.now(), algorithm: 'median-mad-v1' };
}

async function beginCalibration() {
  if (state.connection !== 'connected' && !state.simulator) { toast('Connect a VFM band or start guided demo mode first.'); return; }
  clearRecheck(); state.calibration = { samples: [], goal: TIMING[state.source].calibrationSamples, source: state.source };
  setOperational('CALIBRATING', 'Building your baseline', `Collecting ${state.calibration.goal} quality readings. Keep still.`, 'watch'); renderCalibration();
  await addEvent(`Started ${state.source === 'demo' ? 'accelerated demo' : 'personal'} calibration.`, 'system');
}

async function finishCalibration() {
  state.baseline = buildBaseline(state.calibration.samples); state.calibration = null;
  await store.put('baseline', state.baseline); renderCalibration(); renderMetrics(state.readings.at(-1) || {}, state.readings.at(-1)?.ratio || state.baseline.ratio);
  setOperational('MONITORING', 'Monitoring your flow pattern', 'Your personal baseline is ready. VFM will verify changes before alerting.', 'good');
  await addEvent(`Personal baseline established from ${state.baseline.sampleCount} quality readings.`, 'good'); drawChart();
}

function classify(packet, ratio) {
  const ratioDelta = ((ratio - state.baseline.ratio) / state.baseline.ratio) * 100;
  const amplitudeDelta = ((packet.amplitude - state.baseline.amplitude) / state.baseline.amplitude) * 100;
  const highRatio = ratio >= state.baseline.thresholdRatio; const lowAmplitude = packet.amplitude <= state.baseline.amplitudeThreshold;
  const reason = highRatio && lowAmplitude ? 'Flow ratio rose while signal amplitude fell' : highRatio ? 'Flow ratio is above your personal threshold' : 'Signal amplitude is lower than your baseline';
  return { isAnomalous: highRatio || lowAmplitude, highRatio, lowAmplitude, ratioDelta, amplitudeDelta, reason };
}

function clearRecheck(message = '', tone = 'good') {
  if (!state.recheck) return;
  clearInterval(state.recheckInterval); state.recheckInterval = null; state.recheck = null;
  if (state.baseline && !state.activeAlert) setOperational('MONITORING', 'Monitoring your flow pattern', 'Current readings are within your personal range.', 'good');
  if (message) addEvent(message, tone);
}

function beginRecheck(packet, anomaly) {
  const timing = TIMING[state.source]; const now = Date.now();
  state.recheck = { startedAt: now, endsAt: now + timing.recheckMs, valid: 1, anomalous: 1, lastAnomalous: true, lastGoodAt: now, timing };
  setOperational('RECHECK', 'Rechecking your flow pattern', `VFM is verifying this change for ${Math.round(timing.recheckMs / 1000)} seconds.`, 'watch');
  addEvent(`Pattern change detected: ${anomaly.reason.toLowerCase()}. Starting a second check.`, 'watch');
  state.recheckInterval = setInterval(checkRecheck, 250);
}

function checkRecheck() {
  const recheck = state.recheck; if (!recheck) return;
  const now = Date.now();
  if (now - recheck.lastGoodAt > 10_000) {
    clearRecheck('Signal quality dropped during verification. Reposition the band and try again.', 'watch');
    setOperational('SENSOR_ISSUE', 'Please improve band contact', 'VFM did not turn missing data into an alert.', 'watch'); return;
  }
  const remaining = Math.max(0, recheck.endsAt - now); elements.stateDetail.textContent = `Rechecking: ${delayLabel(remaining)} remaining · ${recheck.anomalous}/${recheck.valid} changed readings.`;
  if (remaining > 0) return;
  const confirmed = recheck.valid >= recheck.timing.recheckValidSamples && recheck.anomalous >= recheck.timing.recheckAnomalies && recheck.lastAnomalous;
  clearInterval(state.recheckInterval); state.recheckInterval = null; state.recheck = null;
  if (confirmed) confirmAlert();
  else {
    setOperational('MONITORING', 'Monitoring your flow pattern', 'The change did not persist through VFM’s second check.', 'good');
    addEvent('The change did not persist through the second check. No alert was raised.', 'good');
  }
}

async function confirmAlert() {
  const latest = state.readings.at(-1); const timing = TIMING[state.source];
  state.activeAlert = { id: id(), state: 'PENDING_ACK', createdAt: Date.now(), dueAt: Date.now() + timing.alertMs, mode: state.source, evidence: latest?.evidence || null };
  await store.put('alerts', state.activeAlert); setOperational('ALERT_PENDING_ACK', 'A flow-pattern change persisted', 'Please acknowledge the VFM check. The safety timer is running.', 'alert');
  const evidence = state.activeAlert.evidence;
  elements.alertEvidence.textContent = evidence ? `VFM observed a ${formatPercent(evidence.ratioDelta)} ratio change and verified it across a second check.` : 'VFM verified this flow-pattern change across a second check.';
  if (elements.alertDialog.showModal && !elements.alertDialog.open) elements.alertDialog.showModal();
  if (navigator.vibrate) navigator.vibrate([180, 100, 180, 100, 260]);
  if (latest?.packet && hasHaptic(latest.packet)) sendControl(1);
  await addEvent('Persistent change confirmed. Started acknowledgement safety timer.', 'alert'); startAlertTimer();
}

function startAlertTimer() {
  clearInterval(state.alertInterval);
  const update = () => {
    if (!state.activeAlert || state.activeAlert.state !== 'PENDING_ACK') return;
    const remaining = state.activeAlert.dueAt - Date.now(); elements.safetyCountdown.textContent = delayLabel(remaining);
    if (remaining <= 0) { clearInterval(state.alertInterval); escalateAlert(); }
  };
  update(); state.alertInterval = setInterval(update, 250);
}

async function acknowledgeAlert() {
  if (!state.activeAlert || state.activeAlert.state !== 'PENDING_ACK') return;
  clearInterval(state.alertInterval); state.activeAlert.state = 'ACKNOWLEDGED'; state.activeAlert.acknowledgedAt = Date.now();
  await store.put('alerts', state.activeAlert); sendControl(2); if (elements.alertDialog.open) elements.alertDialog.close();
  setOperational('ACKNOWLEDGED', 'Alert acknowledged', 'VFM saved the event locally. Follow your agreed care plan if you feel unwell.', 'good');
  await addEvent('Alert acknowledged by the patient.', 'good');
  fetch(`/api/alerts/${encodeURIComponent(state.activeAlert.id)}/acknowledge`, { method: 'POST' }).catch(() => undefined);
  toast('Acknowledgement saved on this device.');
}

async function escalateAlert() {
  if (!state.activeAlert || state.activeAlert.state !== 'PENDING_ACK') return;
  const evidence = state.activeAlert.evidence || {};
  const payload = { id: state.activeAlert.id, patientAlias: state.profile.patientAlias, accessSide: state.profile.accessSide, occurredAt: new Date(state.activeAlert.createdAt).toISOString(), mode: state.source, evidence };
  let delivery = 'LOCAL_SIMULATED_DELIVERY';
  try {
    const response = await fetch('/api/alerts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error('Alert service unavailable');
    const data = await response.json(); delivery = data.delivery || delivery;
  } catch { await addEvent('Alert receipt was recorded locally because the local service was unavailable.', 'watch'); }
  state.activeAlert.state = 'ESCALATED'; state.activeAlert.escalatedAt = Date.now(); state.activeAlert.delivery = delivery; await store.put('alerts', state.activeAlert);
  if (elements.alertDialog.open) elements.alertDialog.close(); sendControl(2);
  setOperational('ESCALATED', 'Demo delivery recorded', 'VFM recorded a simulated clinic notification receipt.', 'alert');
  await addEvent(`Safety timer completed. ${delivery === 'SIMULATED_DELIVERED' ? 'Simulated clinic delivery recorded.' : 'Local delivery record saved.'}`, 'alert');
  toast(delivery === 'SIMULATED_DELIVERED' ? 'Simulated clinic delivery receipt recorded.' : 'Alert saved locally for retry.');
}

function handleInvalidPacket(packet) {
  updateSignal(packet, false);
  if (state.calibration) { elements.calibrationStatus.textContent = `${state.calibration.samples.length} of ${state.calibration.goal} quality readings collected — improve signal`; }
}

async function ingestPacket(packet, source) {
  if (state.simulator && source === 'live') return;
  state.source = source; state.lastPacketAt = Date.now();
  const valid = isValid(packet); updateSignal(packet, valid);
  elements.sourceBadge.textContent = source === 'demo' ? 'Demo replay' : 'Live band';
  if (!valid) { handleInvalidPacket(packet); return; }
  state.lastGoodPacketAt = Date.now();
  const ratio = packet.highBandPower / Math.max(packet.lowBandPower, .000001);
  let anomaly = null;
  if (state.baseline) anomaly = classify(packet, ratio);
  renderMetrics(packet, ratio, anomaly);
  const reading = { timestamp: packet.timestamp || Date.now(), sequence: packet.sequence, ratio, amplitude: packet.amplitude, quality: packet.quality, dominantFrequencyHz: packet.dominantFrequencyHz, source, anomalous: Boolean(anomaly?.isAnomalous), packet, evidence: anomaly };
  state.readings.push(reading); state.readings = state.readings.slice(-60); drawChart();
  store.add('readings', { ...reading, packet: { ...packet } }).then(() => store.pruneReadings()).catch(() => undefined);

  if (state.calibration) {
    state.calibration.samples.push({ ratio, amplitude: packet.amplitude }); renderCalibration();
    if (state.calibration.samples.length >= state.calibration.goal) await finishCalibration();
    return;
  }
  if (!state.baseline) { setOperational('READY', 'Ready to calibrate', 'Start your personal baseline when the band has a good signal.', 'neutral'); renderCalibration(); return; }
  if (state.activeAlert?.state === 'PENDING_ACK') return;
  if (state.recheck) {
    state.recheck.valid += 1; state.recheck.lastGoodAt = Date.now(); state.recheck.lastAnomalous = Boolean(anomaly.isAnomalous); if (anomaly.isAnomalous) state.recheck.anomalous += 1;
    return;
  }
  if (anomaly.isAnomalous) beginRecheck(packet, anomaly);
  else if (state.operational !== 'ACKNOWLEDGED' && state.operational !== 'ESCALATED') setOperational('MONITORING', 'Monitoring your flow pattern', 'Current readings are within your personal range.', 'good');
}

async function sendControl(command) {
  if (!state.control) return;
  try {
    const value = new Uint8Array([PROTOCOL_VERSION, command]);
    if (state.control.writeValueWithoutResponse) await state.control.writeValueWithoutResponse(value); else await state.control.writeValue(value);
  } catch { addEvent('VFM could not send the optional band haptic command.', 'watch'); }
}

function onDisconnected() {
  state.connection = 'disconnected'; state.telemetry = null; state.control = null; state.server = null;
  elements.connectBtn.textContent = 'Connect band'; setPill(elements.connectionPill, 'Band disconnected', 'watch');
  if (!state.simulator) setOperational('DISCONNECTED', 'Band disconnected', 'Reconnect the VFM band to continue monitoring.', 'watch');
  renderCalibration(); addEvent('VFM band disconnected.', 'watch');
}

async function connectBand() {
  if (state.connection === 'connected' && state.device?.gatt?.connected) { state.device.gatt.disconnect(); return; }
  if (!navigator.bluetooth) { toast('Web Bluetooth is unavailable here. Use Android Chrome over HTTPS or the guided demo.'); return; }
  try {
    elements.connectBtn.disabled = true; elements.connectBtn.textContent = 'Pairing…';
    const device = await navigator.bluetooth.requestDevice({ filters: [{ services: [VFM_SERVICE_UUID] }] });
    const server = await device.gatt.connect(); const service = await server.getPrimaryService(VFM_SERVICE_UUID); const telemetry = await service.getCharacteristic(VFM_TELEMETRY_UUID);
    let control = null; try { control = await service.getCharacteristic(VFM_CONTROL_UUID); } catch { /* Control/haptic is optional. */ }
    await telemetry.startNotifications(); telemetry.addEventListener('characteristicvaluechanged', (event) => {
      try { ingestPacket(parseTelemetry(event.target.value), 'live'); }
      catch (error) { addEvent(`Ignored invalid VFM packet: ${error.message}`, 'watch'); }
    });
    device.addEventListener('gattserverdisconnected', onDisconnected, { once: true });
    if (state.calibration?.source === 'demo') state.calibration = null;
    state.source = 'live'; state.device = device; state.server = server; state.telemetry = telemetry; state.control = control; state.connection = 'connected';
    setPill(elements.connectionPill, device.name || 'VFM band connected', 'good'); elements.connectBtn.textContent = 'Disconnect band';
    setOperational('READY', 'Band connected', 'Signal check is ready. Start calibration when placement is stable.', 'good'); renderCalibration();
    await addEvent(`Connected to ${device.name || 'VFM band'}.`, 'good');
  } catch (error) {
    const message = error?.name === 'NotFoundError' ? 'No band was selected.' : `Could not connect: ${error.message}`;
    toast(message); addEvent(message, 'watch'); elements.connectBtn.textContent = 'Connect band';
  } finally { elements.connectBtn.disabled = false; }
}

function demoTelemetry(scenario, tick) {
  const noise = (Math.random() - .5) * .024; const low = .82 + noise; let ratio = 1.24 + noise; let amplitude = .84 + noise; let frequency = 150;
  const calibrationNeeded = !state.baseline || Boolean(state.calibration);
  const postWarmup = calibrationNeeded ? 0 : tick;
  if (scenario === 'transient' && postWarmup >= 2 && postWarmup <= 4) { ratio = 1.50 + noise; frequency = 465; }
  if (scenario === 'persistent' && postWarmup >= 2) { ratio = 1.50 + noise; amplitude = .72 + noise; frequency = 485; }
  return { sequence: tick % 65536, lowBandPower: low, highBandPower: low * ratio, amplitude, dominantFrequencyHz: frequency, quality: 94, bpm: 74, flags: 0b1011 };
}

async function runDemo(scenario) {
  stopDemo(); state.calibration = null; state.source = 'demo'; state.demo = { scenario, tick: 0 };
  state.simulator = setInterval(() => {
    state.demo.tick += 1; const packet = demoTelemetry(scenario, state.demo.tick);
    try { ingestPacket(parseTelemetry(makeDemoFrame(packet)), 'demo'); } catch (error) { addEvent(`Demo packet error: ${error.message}`, 'alert'); }
  }, 1000);
  if (!state.baseline && !state.calibration) await beginCalibration();
  if (state.baseline && scenario === 'normal') setOperational('MONITORING', 'Demo: stable flow', 'Streaming stable replay packets through the VFM engine.', 'good');
  if (state.baseline && scenario === 'transient') setOperational('MONITORING', 'Demo: transient change', 'VFM will recheck and safely clear the short-lived change.', 'good');
  if (state.baseline && scenario === 'persistent') setOperational('MONITORING', 'Demo: persistent change', 'VFM will verify a persistent pattern before it alerts.', 'watch');
  elements.stopDemoBtn.disabled = false; elements.sourceBadge.textContent = 'Demo replay'; renderCalibration();
  await addEvent(`Started ${scenario.replace('-', ' ')} demo replay.`, 'system');
}

function stopDemo() {
  if (!state.simulator) return;
  clearInterval(state.simulator); state.simulator = null; state.demo = null;
  if (state.calibration?.source === 'demo') state.calibration = null;
  elements.stopDemoBtn.disabled = true;
  if (state.connection !== 'connected') setOperational('READY', 'Demo replay stopped', 'Pair a band or choose another replay scenario.', 'neutral');
  addEvent('Demo replay stopped.', 'system'); renderCalibration();
}

async function saveProfile(event) {
  event.preventDefault(); const patientAlias = elements.patientAlias.value.trim(); if (!patientAlias) return;
  state.profile = { id: 'current', patientAlias, accessSide: elements.accessSide.value, updatedAt: Date.now() };
  await store.put('profile', state.profile); elements.savedProfile.textContent = 'Saved only on this device'; toast('Monitoring profile saved locally.'); addEvent('Monitoring profile updated.', 'system');
}

async function exportSummary() {
  const summary = { exportedAt: new Date().toISOString(), profile: state.profile, baseline: state.baseline, alerts: await store.getAll('alerts'), events: await store.getAll('events'), recentReadings: (await store.getAll('readings')).sort((a, b) => a.timestamp - b.timestamp).slice(-120) };
  const blob = new Blob([JSON.stringify(summary, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = `vfm-summary-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url); toast('A local VFM summary was exported.');
}

async function resetData() {
  if (!window.confirm('Reset the VFM profile, baseline, readings, and alerts stored on this device?')) return;
  stopDemo(); clearRecheck(); clearInterval(state.alertInterval); await store.clear(); location.reload();
}

async function checkApi() {
  try {
    const response = await fetch('/api/health', { cache: 'no-store' }); const data = await response.json();
    elements.apiStatus.textContent = data.notificationMode === 'demo' ? 'Demo alert receipt service ready' : 'Alert service ready';
  } catch { elements.apiStatus.textContent = 'Alert receipt service unavailable — local fallback remains active'; }
}

async function restore() {
  try {
    await store.open(); const [profile, baseline, readings, events, alerts] = await Promise.all([store.get('profile', 'current'), store.get('baseline', 'current'), store.getAll('readings'), store.getAll('events'), store.getAll('alerts')]);
    if (profile) state.profile = profile; elements.patientAlias.value = state.profile.patientAlias || ''; elements.accessSide.value = state.profile.accessSide || 'Left';
    state.baseline = baseline; state.readings = readings.sort((a, b) => a.timestamp - b.timestamp).slice(-60); state.events = events.sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);
    state.activeAlert = alerts.sort((a, b) => b.createdAt - a.createdAt)[0] || null;
    renderTimeline(); renderCalibration(); if (state.baseline) { const latest = state.readings.at(-1); if (latest) renderMetrics(latest.packet || latest, latest.ratio, latest.evidence); elements.baselineValue.textContent = state.baseline.ratio.toFixed(3); elements.thresholdText.textContent = `Alert threshold ${state.baseline.thresholdRatio.toFixed(3)}`; }
    drawChart();
    if (state.activeAlert?.state === 'PENDING_ACK') {
      if (state.activeAlert.dueAt <= Date.now()) escalateAlert(); else { setOperational('ALERT_PENDING_ACK', 'A flow-pattern change persisted', 'Your pending VFM acknowledgement was restored.', 'alert'); elements.alertEvidence.textContent = 'A prior VFM alert is awaiting acknowledgement.'; if (elements.alertDialog.showModal) elements.alertDialog.showModal(); startAlertTimer(); }
    }
  } catch (error) { toast(`Local storage is unavailable: ${error.message}`); }
  setPill(elements.connectionPill, 'Not connected', 'neutral'); renderCalibration(); checkApi();
}

elements.connectBtn.addEventListener('click', connectBand);
elements.calibrateBtn.addEventListener('click', beginCalibration);
elements.profileForm.addEventListener('submit', saveProfile);
document.querySelectorAll('[data-demo]').forEach((button) => button.addEventListener('click', () => runDemo(button.dataset.demo)));
elements.stopDemoBtn.addEventListener('click', stopDemo);
elements.acknowledgeBtn.addEventListener('click', acknowledgeAlert);
elements.repositionBtn.addEventListener('click', () => { toast('Reposition the band and keep your arm still. The alert timer remains active until acknowledged.'); elements.alertEvidence.textContent = 'Reposition the band, then acknowledge when you have completed your safety check.'; });
elements.alertDialog.addEventListener('cancel', (event) => { if (state.activeAlert?.state === 'PENDING_ACK') event.preventDefault(); });
elements.exportBtn.addEventListener('click', exportSummary); elements.resetBtn.addEventListener('click', resetData);
window.addEventListener('resize', drawChart);
restore();
