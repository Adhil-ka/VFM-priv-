# Vascular Flow Monitor (VFM)

<p align="center">
  <strong>A privacy-first vascular-access monitoring prototype for earlier, clearer detection of persistent flow-pattern changes.</strong>
</p>

<p align="center">
  <em>Hackathon prototype · Web Bluetooth · ESP32-compatible telemetry · Personalized baseline analysis</em>
</p>

> **Important:** VFM is a decision-support demonstration, not a medical device. It does not diagnose stenosis or thrombosis, replace clinical advice, contact emergency services, or make treatment decisions.

---

## 1. The problem

For people who rely on an arteriovenous (AV) fistula for hemodialysis, changes in vascular access flow can be clinically important. Today, many changes are discovered during scheduled checks or after symptoms become obvious. That creates a difficult gap between **continuous physiological change** and **intermittent human observation**.

VFM explores a simple question:

> **Can a wearable notice that a person's flow pattern has changed from their own normal pattern, verify that the change persists, and explain the result clearly enough for the person to take the next appropriate step?**

The prototype is intentionally designed around **personalized change detection**, rather than a universal threshold. Every person, sensor placement, device, and access site can produce a different normal signal. VFM therefore learns a local baseline and evaluates new readings against that baseline.

---

## 2. The product in one sentence

**VFM connects an acoustic and pulse-sensing wearable to a phone, builds a personal baseline, checks new flow features against that baseline, rechecks persistent changes, and presents an understandable alert with a simulated escalation path.**

This is not a diagnosis engine. It is an early-warning and explanation layer designed to support a future clinically validated workflow.

---

## 3. Why this approach is different

### Personalized instead of one-size-fits-all

VFM compares current measurements with the user's own recent baseline. This reduces dependence on a single population-wide threshold that may not generalize across access sites, body types, sensor placement, or hardware revisions.

### Recheck before escalating

A single unusual reading may be caused by movement, poor sensor contact, environmental noise, or a loose band. VFM uses a two-stage validation flow:

1. Detect a meaningful deviation from baseline.
2. Perform a second check before presenting a persistent-change alert.

### Privacy by default

The browser receives derived telemetry features rather than raw audio. The prototype stores local profile and monitoring state in the browser and writes a local audit record for simulated alert events. There is no required cloud database or continuous cloud telemetry stream.

### Designed for explanation

The interface does not only show a red warning. It shows the measured ratio, baseline, change percentage, signal quality, band-contact state, timeline events, and the evidence behind a recheck result.

### Honest about uncertainty

The UI clearly labels demo behavior, simulated notifications, and the medical-device boundary. That is important for a safety-sensitive prototype: the system must not imply more certainty than the evidence supports.

---

## 4. Judge-ready elevator pitch

> **Vascular Flow Monitor is a privacy-first wearable monitoring prototype for AV-fistula flow patterns. An ESP32-compatible band sends compact acoustic and pulse features to Android Chrome over Web Bluetooth. The phone learns the user's personal baseline, detects meaningful deviations, and runs a second check to filter out motion and placement artifacts. If the change persists, VFM gives the user a clear, explainable alert and starts a simulated safety timer. Our prototype proves the end-to-end interaction—from wearable telemetry to baseline analysis to auditable escalation—without claiming to diagnose disease or replace a clinician.**

---

## 5. How the system works

```text
┌──────────────────────────┐
│ Wearable prototype       │
│ ESP32 + sensors          │
│ Acoustic + optical data  │
└────────────┬─────────────┘
             │ BLE notification packets
             ▼
┌──────────────────────────┐
│ Android Chrome           │
│ Web Bluetooth client     │
│ Decode + quality checks  │
└────────────┬─────────────┘
             ▼
┌──────────────────────────┐
│ Personal baseline layer  │
│ Rolling feature history  │
│ Ratio + delta analysis   │
└────────────┬─────────────┘
             ▼
┌──────────────────────────┐
│ Two-stage validation     │
│ Trigger → recheck        │
└────────────┬─────────────┘
             ▼
┌──────────────────────────┐
│ User-facing explanation  │
│ Trend, quality, evidence │
└────────────┬─────────────┘
             ▼
┌──────────────────────────┐
│ Prototype escalation     │
│ Haptic + popup + audit   │
│ Simulated delivery      │
└──────────────────────────┘
```

### End-to-end flow

1. The user connects a band named `VFM-Band`.
2. The browser receives compact telemetry over a BLE notification characteristic.
3. VFM rejects or down-weights readings with poor quality or missing contact.
4. During calibration, the app collects quality-checked readings and establishes a local personal baseline.
5. New readings are converted into a flow-pattern ratio using high-band and low-band acoustic energy.
6. The current ratio is compared with the user's baseline and threshold.
7. A meaningful change starts a second-check window.
8. A transient change is cleared; a persistent change opens the alert dialog.
9. The band can receive a haptic command, while the server records a simulated escalation audit event.
10. The user can acknowledge the alert before the accelerated demo timer completes.

---

## 6. What the current website actually demonstrates

The repository contains a browser-based prototype rather than a native mobile application. The main experience is served from `AVF.html` and uses the following user-facing sections:

- **Connection status:** Connect or disconnect the VFM band and see the current device state.
- **Monitoring profile:** Store a display alias and access side locally on the device.
- **Personal calibration:** Collect a quality-checked baseline before monitoring begins.
- **Live metrics:** View the current flow-pattern ratio, personal baseline, percentage change, and signal quality.
- **Trend chart:** Compare current readings with the personal threshold over time.
- **Signal check:** See sensor contact, quality, and placement guidance.
- **VFM timeline:** Understand what the system has done and why.
- **Guided demo mode:** Replay stable flow, transient change, and persistent change scenarios without requiring a physical band.
- **Alert dialog:** Explain that the change persisted across a second check and start the prototype safety timer.
- **Data controls:** Export a monitoring summary or reset VFM data stored on the device.

The demo mode is especially important for judging. It exercises the same validation and alert path as live telemetry while making the presentation reliable and safe.

---

## 7. Product architecture

### 7.1 Wearable layer

The intended prototype wearable is an ESP32-based device with:

- A piezoelectric or contact vibration sensor positioned over the simulated access site.
- A MAX30102-style optical pulse sensor for supporting pulse-wave features.
- BLE advertising and notifications for telemetry.
- Optional haptic feedback controlled by a BLE write characteristic.

The ESP32 is appropriate for a hackathon because it is inexpensive, widely available, and includes BLE. It is not presented as the final medical hardware design.

### 7.2 Browser and edge-analysis layer

The browser is the primary interaction and analysis surface in this MVP:

- Web Bluetooth connects Android Chrome to the band.
- Telemetry is decoded as little-endian binary data.
- Signal quality and contact flags are checked before readings are used.
- The app calculates a compact flow-pattern ratio from low-band and high-band acoustic power.
- A rolling personal baseline and delta heuristic drive the recheck logic.
- The interface explains the result using metrics, trend visualization, and timeline events.

### 7.3 Local data layer

The current prototype intentionally avoids requiring a cloud backend for normal monitoring. The browser stores derived state locally, while the local Node server supports the demo alert workflow and audit logging.

The server writes simulated alert events to:

```text
data/alert-audit.ndjson
```

Each line is a separate JSON audit event, making it easy to inspect during a presentation without claiming that a real clinical message was sent.

### 7.4 Notification layer

The default mode is safe demo mode:

- The server returns a simulated delivery receipt.
- An audit event is written locally.
- No real SMS or WhatsApp message is sent.

A Twilio provider exists as an optional server-side integration path, but it is not enabled by default and should not be treated as a production clinical escalation workflow.

---

## 8. BLE contract

The browser and wearable share a deliberately small contract.

| Item | Value |
| --- | --- |
| Advertising name | `VFM-Band` |
| Service UUID | `3e5f0001-4c95-4b1a-9b35-9f31c2608c01` |
| Notify telemetry UUID | `3e5f0002-4c95-4b1a-9b35-9f31c2608c01` |
| Write control UUID | `3e5f0003-4c95-4b1a-9b35-9f31c2608c01` |

### Telemetry packet

Telemetry is exactly 20 bytes and uses little-endian encoding:

| Field | Type | Purpose |
| --- | --- | --- |
| Version | `u8` | Packet format version |
| Sequence | `u16` | Reading order and continuity check |
| Low-band power | `f32` | Lower-frequency acoustic energy |
| High-band power | `f32` | Higher-frequency acoustic energy |
| Acoustic amplitude | `f32` | Overall acoustic signal magnitude |
| Dominant frequency | `u16` | Dominant frequency in Hz |
| Quality | `u8` | Signal-quality score or category |
| BPM | `u8` | Pulse estimate |
| Flags | `u8` | Contact, PPG, fault, and haptic state |

### Flags

| Bit | Meaning |
| --- | --- |
| 0 | Sensor contact present |
| 1 | PPG value valid |
| 2 | Device fault detected |
| 3 | Haptic feedback available |

### Control packet

Control packets are two bytes:

```text
[1, command]
```

| Command | Meaning |
| --- | --- |
| `1` | Pulse haptic feedback |
| `2` | Stop haptic feedback |

Keeping the contract compact makes it easier to replace the physical wearable, replay synthetic telemetry, or migrate from an ESP32 prototype to a lower-power BLE platform.

---

## 9. Signal-processing and decision logic

The prototype focuses on derived features rather than raw-audio storage.

### Feature representation

The central demonstration feature is a flow-pattern ratio:

```text
flow-pattern ratio = high-band acoustic power / low-band acoustic power
```

This ratio is not a diagnosis. It is a compact way to demonstrate how changes in the distribution of acoustic energy could be tracked over time.

The telemetry also includes:

- Acoustic amplitude.
- Dominant frequency.
- Pulse rate estimate.
- Signal quality.
- Sensor-contact state.
- Device-fault state.

### Baseline

During calibration, VFM collects quality-checked readings and calculates a personal reference value. The interface exposes that baseline so the judge can see that the system is not operating as a black box.

### Trigger and recheck

The intended decision flow is:

```text
New reading
   │
   ├─ Poor contact / poor quality? ── yes ──> placement guidance; do not escalate
   │
   ▼
Compare with personal baseline
   │
   ├─ Within expected range? ── yes ──> continue monitoring
   │
   ▼
Start secondary check
   │
   ├─ Change disappears? ── yes ──> classify as transient and clear
   │
   ▼
Persistent change
   │
   ├─ Show evidence and haptic prompt
   ├─ Start acknowledgement timer
   └─ Record simulated escalation event if not acknowledged
```

This two-stage approach is the core safety-oriented product idea: **do not turn one noisy reading into a high-stakes notification.**

---

## 10. Hackathon demonstration script

### Demo setup

Use a closed-loop flow rig:

- Clear silicone tubing.
- Small 5V water pump.
- Water reservoir.
- Contact acoustic sensor strapped to the tubing.
- Optional ESP32 telemetry transmitter.
- Laptop for the local server.
- Android phone running Chrome for Web Bluetooth.

The rig is a visual and acoustic analogy for changing flow. It is not a biological model and must be described that way.

### Three-minute presentation flow

#### 1. Start in stable flow

Say:

> “First, VFM learns what normal looks like for this sensor placement and this simulated access. We are building a personal baseline, not using a universal number.”

Show:

- Connected band.
- Calibration progress.
- Stable trend.
- Good signal quality.

#### 2. Create a transient disturbance

Briefly move or loosen the sensor.

Say:

> “A real monitoring system must distinguish a meaningful pattern from movement or poor contact. This first disturbance should be treated as uncertain, not immediately escalated.”

Show:

- Signal-quality change.
- Placement guidance.
- No persistent alert.

#### 3. Create a persistent flow-pattern change

Gently pinch the silicone tube or switch the guided demo to persistent change.

Say:

> “Now the change persists across the secondary check. VFM explains what changed relative to baseline, gives the user a clear prompt, and starts a simulated acknowledgement timer.”

Show:

- Flow-pattern ratio shift.
- Baseline comparison.
- Second-check confirmation.
- Haptic or haptic simulation.
- Alert dialog.
- Audit record or simulated delivery receipt.

#### 4. Close with the boundary

Say:

> “This prototype demonstrates the product interaction and architecture. It does not diagnose stenosis, contact emergency services, or claim clinical validation. The next step is validation with clinicians, controlled data, and regulated hardware.”

---

## 11. Why the prototype uses synthetic data

Real AV-fistula telemetry is difficult to obtain because it involves clinical populations, privacy constraints, institutional approvals, and specialized acquisition protocols. The hackathon MVP therefore uses:

- A physical water-flow rig for an intuitive live demonstration.
- Guided synthetic scenarios for reliable presentation.
- Personalized baseline deltas instead of claiming a clinically validated universal cutoff.
- Derived feature telemetry instead of storing raw audio.

This is a deliberate engineering choice, not a hidden limitation. The architecture is designed so validated clinical data and clinician-reviewed models can be introduced later without rebuilding the user experience from scratch.

A strong judge-facing answer is:

> “We are proving the closed-loop interaction and explainable baseline architecture first. Clinical thresholds require controlled studies and regulatory work, so this version uses synthetic perturbation profiles and a physical flow rig rather than pretending hackathon data is clinical evidence.”

---

## 12. Safety, privacy, and responsible scope

### What VFM does

- Detects changes in derived flow-pattern features.
- Checks signal quality and sensor contact.
- Rechecks a suspected change before escalating.
- Explains the evidence shown in the interface.
- Records simulated alert events for auditability.

### What VFM does not do

- Diagnose stenosis, thrombosis, infection, or any other condition.
- Replace a clinician or a dialysis-center assessment.
- Provide emergency response.
- Store or analyze raw audio in the current prototype.
- Claim that an alert is clinically validated.
- Guarantee that a normal result means the access is healthy.

### Privacy principles

- Derived features are preferred over raw audio.
- Local browser storage is used for the monitoring profile and demo state.
- The default server notification mode is simulated.
- No real message is sent unless an operator deliberately configures a separate provider.
- The UI identifies the prototype boundary directly rather than hiding it in technical documentation.

---

## 13. Running the prototype locally

### Requirements

- Node.js 20 or newer.
- A modern browser.
- Android Chrome for Web Bluetooth testing.
- Optional `cloudflared` installation for HTTPS tunneling.

### Start the local server

```bash
npm install
npm start
```

Then open:

```text
http://127.0.0.1:3000
```

The server serves `AVF.html` as the application entry point.

### Android Chrome and Web Bluetooth

Web Bluetooth requires a secure context for phone testing. From the development machine, run:

```bash
cloudflared tunnel --url http://127.0.0.1:3000
```

Open the generated HTTPS address on Android Chrome.

### Development mode

```bash
npm run dev
```

The development script runs the Node server with file watching enabled.

### Demo-only notification mode

The default mode is already safe for presentations:

```text
VFM_NOTIFICATION_MODE=demo
```

The server returns a simulated delivery receipt and appends an audit event to `data/alert-audit.ndjson`.

A Twilio mode is available as an integration seam, but it requires server-side environment variables and should only be used in a controlled, non-clinical test environment:

```text
VFM_NOTIFICATION_MODE=twilio
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM=...
TWILIO_TO=...
```

Never expose provider credentials in browser code or commit them to the repository.

---

## 14. Repository structure

```text
.
├── AVF.html              # Main VFM browser interface
├── assets/
│   ├── vfm.css           # Visual system and responsive layout
│   └── vfm.js            # BLE, calibration, demo, chart, and alert logic
├── server.mjs            # Static server, health endpoint, and alert audit API
├── package.json          # Node metadata and start/dev scripts
├── .env.example          # Optional server-side notification configuration
├── handoff.md            # Project handoff and implementation notes
└── data/
    └── alert-audit.ndjson # Generated local audit output; not clinical data
```

The physical ESP32 firmware is not included in this repository. The browser and server are designed around the BLE contract documented above so firmware can be developed and tested independently.

---

## 15. API surface

The local server exposes a deliberately small API.

### Health check

```http
GET /api/health
```

Returns server status and the active notification mode.

### Create an alert event

```http
POST /api/alerts
Content-Type: application/json
```

The server normalizes the alert, invokes the configured notification provider, stores the in-memory event, and appends an audit record.

### Acknowledge an alert

```http
POST /api/alerts/{id}/acknowledge
```

Appends an acknowledgement event with a timestamp. In the demo, this represents the user responding before the safety timer expires.

The server also applies basic safety controls such as JSON size limits, input normalization, security headers, and path traversal protection.

---

## 16. Production roadmap

### Phase 1 — Prototype reliability

- Include and validate reference ESP32 firmware.
- Add deterministic telemetry replay tests.
- Improve BLE reconnect behavior and packet-loss handling.
- Add automated tests for baseline and recheck logic.
- Make all alert timing behavior configurable and testable.

### Phase 2 — Signal and hardware validation

- Compare sensor placements and acoustic coupling methods.
- Characterize pump, tubing, motion, and environmental noise.
- Evaluate battery life and enclosure ergonomics.
- Validate feature stability across devices and users.
- Conduct clinician-reviewed data collection under an approved protocol.

### Phase 3 — Clinical and regulatory pathway

- Define intended use and risk controls.
- Establish validated endpoints and performance metrics.
- Perform prospective clinical evaluation.
- Replace heuristic thresholds with clinically justified models.
- Implement secure identity, consent, retention, access control, and audit policies.
- Determine the applicable regulatory classification before making clinical claims.

### Production hardware direction

The hackathon ESP32 can be replaced with a lower-power BLE SoC such as an nRF52/nRF52840-class platform. The future form factor could use a compact, hypoallergenic elastomer band with controlled sensor contact and a dedicated charging and diagnostics workflow.

---

## 17. Judge questions and strong answers

### “Is this diagnosing stenosis?”

No. The current prototype detects and explains a persistent change in derived signal features relative to a personal baseline. It is a decision-support demonstration, not a diagnostic device.

### “Why not use a fixed threshold?”

A fixed threshold may not generalize across people, access sites, sensor placement, or hardware. A personal baseline lets the prototype demonstrate individualized change detection while leaving clinical threshold selection to future validation.

### “Why does the app need a second check?”

Movement, loose placement, and environmental noise can create one-off changes. The second check is a simple, understandable false-positive reduction step before an alert is shown.

### “Why use an ESP32?”

The ESP32 is inexpensive and fast to prototype with because it includes BLE and enough processing for the hackathon hardware. A production design would prioritize power consumption, enclosure integration, sensor validation, and a regulated hardware pathway.

### “Why is there no real clinical dataset?”

Clinical AV-fistula datasets require privacy protections, institutional approvals, and controlled acquisition. The prototype uses synthetic perturbations and a flow rig to prove the interaction without presenting unvalidated data as clinical evidence.

### “Does it message a clinic?”

The default mode does not send real messages. It returns a simulated delivery receipt and writes a local audit event. A server-side notification provider is included as an integration seam, but it is not a production clinical escalation service.

### “What happens if the sensor is poorly placed?”

VFM exposes contact and signal quality, provides placement guidance, and avoids treating low-quality readings as strong evidence. This is one of the reasons the recheck and quality layers are visible in the interface.

### “What is the most important next experiment?”

Collect synchronized, clinician-reviewed recordings across normal flow, controlled perturbations, movement, placement variation, and different hardware conditions. Then measure sensitivity, specificity, false-alert rate, latency, and usability before making any clinical claim.

---

## 18. Success metrics for the next iteration

The next version should be evaluated with explicit engineering and clinical-validation metrics:

- Percentage of readings passing quality checks.
- BLE packet-loss and reconnect rate.
- Calibration completion rate.
- Median detection latency.
- False-alert rate during movement and repositioning.
- Recheck confirmation rate.
- User acknowledgement time.
- Battery life of the wearable.
- Agreement between algorithm output and clinician-reviewed labels.
- Explainability: whether users and judges can identify why an alert occurred.

The goal is not simply to make the interface flash red. The goal is to make the system **reliable, interpretable, privacy-aware, and appropriately cautious**.

---

## 19. Final takeaway

VFM is a compact demonstration of a broader product idea:

> **Use a wearable to make subtle physiological change visible, use a personal baseline to make the signal meaningful, use a recheck to make the alert more responsible, and use clear explanations to keep the human in control.**

The hackathon contribution is not a claim of clinical readiness. It is an end-to-end, privacy-first prototype that makes the path from wearable telemetry to explainable decision support tangible, testable, and ready for the next stage of engineering and clinical validation.

---

## License and project status

This repository is a hackathon prototype. Review the repository's licensing and contribution files before redistributing or integrating the code into another project.
