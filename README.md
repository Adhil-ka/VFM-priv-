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
