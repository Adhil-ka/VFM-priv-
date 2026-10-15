# Vascular Flow Monitor (VFM)

VFM is a hackathon prototype that pairs an ESP32 wearable to Android Chrome using Web Bluetooth, learns a local personal baseline, and explains persistent feature changes with a two-stage recheck.

## Run locally

1. Open PowerShell in this folder.
2. Run `node server.mjs`.
3. Open `http://127.0.0.1:3000` on the development machine.
4. For Android Chrome and Web Bluetooth, expose the app over HTTPS: `cloudflared tunnel --url http://127.0.0.1:3000`.
5. Open the generated HTTPS address on the Android phone.

The default alert service returns a simulated delivery receipt and writes an audit record to `data/alert-audit.ndjson`. It sends no real messages.

## VFM BLE contract

| Item | Value |
| --- | --- |
| Advertising name | `VFM-Band` |
| Service | `3e5f0001-4c95-4b1a-9b35-9f31c2608c01` |
| Notify telemetry | `3e5f0002-4c95-4b1a-9b35-9f31c2608c01` |
| Write control | `3e5f0003-4c95-4b1a-9b35-9f31c2608c01` |

Telemetry is exactly 20 bytes, little-endian: version `u8`, sequence `u16`, low-band power `f32`, high-band power `f32`, acoustic amplitude `f32`, dominant frequency `u16`, quality `u8`, BPM `u8`, flags `u8`.

Flags: bit 0 sensor contact, bit 1 valid PPG, bit 2 device fault, bit 3 haptic available. Control packets are `[1, command]`: `1` pulse haptic, `2` stop haptic.

## Safety boundary

This is a prototype decision-support demonstration, not a medical device. It stores derived features, not raw audio, and must not be represented as a diagnosis or emergency-service integration.



addon(## Master Implementation Plan & Architecture Specification

\--------------------------------------------------------------------------------

## 1\. Executive Summary & Product Vision

*FistulaGuard* is a continuous, non-invasive vascular access monitoring system designed for hemodialysis patients with Arteriovenous (AV) fistulas. Acting as a "continuous glucose monitor (CGM) for vascular access," FistulaGuard detects early vascular stenosis (narrowing of the blood vessel) by continuously tracking acoustic bruits and pulse waveforms.

The primary clinical objective is to catch thrombosis or stenosis risks before total access failure, drastically reducing emergency thrombectomies and hospitalization rates while keeping patient biometric data 100% private.

\--------------------------------------------------------------------------------

## 2\. System Architecture & Component Breakdown

```
[ Wearable Band (ESP32 / nRF52) ]
│ (BLE / Serial Telemetry)
▼
[ Mobile App (iOS / Android) ]
├── Local SQLite DB (Privacy-First Storage)
├── Edge DSP Engine (FFT & Rolling Delta Analysis)
└── 5-Minute Safety Timer & Mock Twilio SMS Dispatch

```

### 2.1 Hardware Specifications

* *Prototype Stage (Hackathon MVP):*
* *Microcontroller:* ESP32 Dev Board (dual-core processing, onboard Wi-Fi/BLE for rapid prototyping).
* *Acoustic Sensor:* Piezoelectric vibration/contact sensor paired with a miniature stethoscope diaphragm to capture vascular bruits (frequencies typically 100Hz–600Hz).
* *Optical Pulse Sensor:* MAX30102 reflective oximeter sensor for parallel pulse-wave morphology tracking.
* *Production Roadmap:*
* *Microcontroller:* Nordic nRF52840 (ultra-low-power BLE SoC, multi-day battery life in a slim elastomer band).
* *Form Factor:* Whoop-style continuous elastomer wristband with medical-grade hypoallergenic contact points.

### 2.2 Software & Signal Processing Stack

* *Data Ingestion:* C++ (Arduino IDE) for analog-to-digital sampling and baseline noise filtering.
* *DSP & Feature Extraction (Python/TypeScript Edge Engine):*
* Bandpass filtering (removing ambient 50Hz/60Hz grid noise and 0.5–4Hz motion artifacts).
* Fast Fourier Transform (FFT) power spectral density mapping to detect high-frequency energy shifts associated with turbulent flow (stenosis signature).
* *Data Storage:* Local SQLite database. No cloud streaming by default, ensuring absolute privacy compliance and zero server infrastructure costs.

\--------------------------------------------------------------------------------

## 3\. Core Features & User Workflow

1. *Continuous Background Monitoring:* The band periodically samples acoustic bruits and optical pulse waves (e.g., 30-second window every 15 minutes) to conserve battery and eliminate false-positive fatigue.
2. *Local Edge Anomaly Detection:* The smartphone app runs a lightweight baseline delta heuristic comparing current FFT profiles against the user’s established rolling baseline.
3. *Two-Tier Validation Protocol:*
* _Trigger 1:_ Sudden frequency spike or 30%+ drop in signal amplitude detected.
* _Trigger 2:_ Immediate secondary recheck window (within 60 seconds) to filter out transient motion artifacts or loose band placement.
4. *User Alert & 5-Minute Safety Timer:* If confirmed, the user receives an immediate haptic pulse and mobile popup alert: _⚠️ "Acoustic turbulence detected on Left Arm AV Fistula. Please verify status."_
5. *Automated Clinic Escalation:* If the user does not dismiss or respond within 5 minutes, the app triggers an automated Twilio API SMS/WhatsApp dispatch containing telemetry logs, GPS coordinates, and stenosis confidence metrics directly to the designated nephrology clinic contact.

\--------------------------------------------------------------------------------

## 4\. Hackathon Demo Setup & Physical Rig

To demonstrate the system live on stage without risking patient safety or relying on unreleased clinical datasets:

* *The Flow Rig:* A clear silicone tube simulating an AV fistula connected in a closed loop to a 5V submersible miniature water pump and water reservoir.
* *The Sensor Rig:* The contact acoustic sensor strapped firmly against the silicone tube.
* *The Trigger Demonstration:*
1. _Normal State:_ Water flows smoothly; the Streamlit/React Native dashboard shows a clean baseline waveform and normal frequency distribution.
2. _Stenosis Event:_ Manually pinch the silicone tube with fingers or a clamp. Flow restriction instantly creates acoustic turbulence.
3. _The Result:_ The FFT graph shifts, the algorithm catches the anomaly, the UI flashes red, and the mock Twilio SMS fires to the team's phone.

\--------------------------------------------------------------------------------

## 5\. Handling Data Constraints & Judge Deflections

* *The Data Wall:* Public, open-source clinical AVF datasets (such as the FiSaV dataset or closed-source hospital studies like Severance Hospital's acoustic research) are restricted behind institutional review boards and HIPAA.
* *Hackathon Defense:* _"Because real AVF telemetry is locked inside clinical data silos, our MVP relies on personalized baseline delta tracking and synthetic acoustic perturbation profiles for the demo. The core innovation is our extensible edge-AI architecture designed to ingest real clinical trial weights as soon as regulatory pilot access is granted."_
* *Hardware Objection Handling:* _"We used an ESP32 for rapid weekend iteration to prove the DSP pipeline works. Production scaling migrates directly to an nRF52 BLE SoC in a medical elastomer band."_)