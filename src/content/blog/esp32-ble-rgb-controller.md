---
title: 'DIY BLE RGB Controller (ESP32-C3)'
description: 'Rebuilding a dead cheap LED controller from scratch with an ESP32-C3, logic-level MOSFETs, and custom Bluetooth firmware.'
pubDate: 'Jun 12 2026'
---

## Overview

My cheap analog RGB strip controller (a "610+MIC+IR-V05" board) burnt out.
Instead of buying another $8 board destined to die the same way, I rebuilt it
from some relatively cheap parts I could find easily online: an **ESP32-C3**,
3x **IRLZ44N** logic-level MOSFETs, and a **Mini360 (MP2307)** buck
converter. The goal: get back the one feature I actually used from the original:
phone-based RGB control over Bluetooth, like the "HappyLighting" app without
the mic or IR features I never touched.

## Parts

- ESP32-C3 (any dev board; I used a C3 Super Mini)
- 3× IRLZ44N N-channel MOSFETs (one per color channel)
- Mini360 / MP2307 buck converter (12V → 5V)
- 3× 220 Ω gate resistors
- 3× 10 kΩ gate pulldown resistors
- 12V power supply (matched to the strip)
- Common-anode analog RGB strip (4 wires: shared +, and R/G/B returns)

## How it works

The strip is **common-anode analog** — one shared 12V line, separate R/G/B
return wires. Each color channel is one IRLZ44N wired as a **low-side switch**:
the strip's color wire goes to the MOSFET drain, source to ground, and the gate
to an ESP32 PWM pin through a 220 Ω resistor, with a 10 kΩ pulldown from gate to
ground. PWM dims each color; mixing the three gives full-spectrum color.

Power: the 12V supply feeds the strip's `+` rail directly and also feeds the
Mini360, which I stepped down to **5V into the ESP32's 5V/VBUS pin** (not 3V3 —
let the board's own regulator make 3.3V).

## What broke / what I learned

- **The 3.3V gate-drive caveat:** the IRLZ44N is logic-level, but its on-resistance
  is spec'd at 5V gate drive, not 3.3V. At my strip's current (~1–3A/channel) it
  sits comfortably in its ohmic region and runs cool. For longer/doubled strips
  pulling more current it'd need a heatsink or a proper gate driver.
- **GPIO choice matters on the C3:** avoid strapping pins (2/8/9), the native-USB
  pins (18/19), and the default UART pins (20/21). I used GPIO 3/4/5 for R/G/B.
- The 10 kΩ pulldowns hold the MOSFETs off during boot/reset/flashing so the
  strip doesn't flash on unexpectedly.

## Firmware

I went **DIY BLE-only** firmware (no WiFi, so no radio contention on the C3),
exposing solid color, master brightness, and a couple of effects (rainbow cycle
and breathe) — the HappyLighting essentials. The simpler alternative would've
been flashing **WLED**, which supports analog/PWM output and is basically a
software clone of the original board, but I wanted real BLE control and the
practice of writing the firmware myself.

## Result

Full RGB control over Bluetooth from my phone, on hardware I built and can
actually repair. Total new spend: a few resistors.