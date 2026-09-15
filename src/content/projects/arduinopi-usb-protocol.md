---
title: 'Rolling My Own Serial Protocol (Arduino <-> Pi)'
description: 'Building a real framed wire protocol between an Arduino and a Raspberry Pi: checksums, a parser state machine, and the classic serial bugs. Unfinished, on purpose-ish.'
pubDate: 'Feb 21 2026'
status: 'shelved'
tags: ['Arduino', 'Raspberry Pi', 'Serial', 'Protocols', 'Python', 'C++']
difficulty: 3
cost: '$0'
---

>All source code for this project can be found [here](https://github.com/jdankney/arduino-pi-serial-protocol).

## Overview
After the Meshtastic nodes I was burnt out on radios but not on the *feeling* of bare-metal; packets flying, LEDs obeying. So I picked a project that kept that feeling with zero new hardware: build a real, framed communication protocol between my **Arduino Uno R3** and my **Raspberry Pi 4B** over plain USB serial.

The rule I set for myself: **not** "print a string and parse it on the other end." Treat it like an actual wire protocol: start-of-frame markers, length fields, message types, checksums, a proper parser. The asymmetry is the whole point: the Arduino is tiny and dumb and honest, the Pi is a spoiled Linux box with all the RAM in the world. That's the same shape as every real embedded-to-host link, so building it from scratch teaches you *why* protocols look the way they do.

Full disclosure up front, since the title gives it away: **I got the working baseline done and then stopped before the interesting security half.** More on that at the end, but the part I did build taught me a lot, and the bugs I hit were the good kind.

## Parts / Tools
- Arduino Uno R3 (the "device")
- Raspberry Pi 4B (actually I did most of the host side on my Arch laptop (`archangel`), same idea: it's the "host")
- A USB cable. That's the entire bill of materials.
- Arduino C++ on the device side, Python + `pyserial` on the host side

`$0`. Everything was already on hand.

## How it works
The core idea is **framing**: instead of sending loose bytes or newline-terminated strings, every message is a structured frame the receiver can validate.

**Frame format (v1):**
```
[0]    START    = 0xAA
[1]    LEN      = number of bytes from TYPE to CHECKSUM inclusive
[2]    TYPE     = message type
[...]  PAYLOAD  = optional
[N-1]  CHECKSUM = XOR of all bytes from LEN through the last payload byte
```

**Message types I defined:**
```
0x01 = PING
0x02 = PONG
0x03 = LED_ON
0x04 = LED_OFF
0x10 = STATS   (device reports frames-seen / frames-valid counters)
```

The Arduino side is a **byte-by-byte state machine**, which is the key discipline, you do *not* read a whole line and hope. It sits in `WAIT_START` discarding bytes until it sees `0xAA`, then reads `LEN`, then accumulates exactly that many bytes, then verifies the XOR checksum before acting on the frame. Valid PING -> it sends back a PONG frame; LED_ON/OFF -> it toggles the built-in LED; STATS -> it reports how many frames it's seen versus how many passed the checksum. If the checksum fails, the frame is dropped and the counter reflects it.

The Python host builds frames with a `make_frame()` helper (prepend `0xAA`, compute LEN, append the XOR), writes them over `pyserial`, and reads responses back. The satisfying first milestone was dead simple and genuinely fun: type `ping`, watch `PONG` come back; type `on`, watch the LED obey. Electrons turning into evidence.

## What broke / what I learned
This is where the project earned its keep. Every bug was a *classic* serial/protocol bug, the kind you only really understand once it's bitten you.

**1. Partial reads — the big one.** My host `read_frame()` naively did `ser.read(1)` for start, `ser.read(1)` for length, then `ser.read(length)` for the body. It kept returning nothing. The reason is the single most important lesson in serial programming: **`ser.read(n)` gives you *up to* n bytes, not exactly n.** Depending on USB buffering, the Arduino's frame can arrive split across multiple reads, so `read(length)` frequently came back short and my parser bailed. The fix is to **accumulate** — read one byte at a time into a buffer and only return once you've got `START + LEN + length` bytes total. That's *why* the Arduino side was already a byte-by-byte state machine, and I learned the host has to think the same way. You never assume a message arrives whole.

**2. `UnboundLocalError` on `length`.** When I rewrote `read_frame()` to accumulate, I defined `length` *inside* the loop (only after reading the 2nd byte) but referenced it in the loop condition `len(buf) == 2 + length` on earlier iterations, before it existed. Python threw `cannot access local variable 'length'`. Fix was a one-liner: initialize `length = None` before the loop and guard the check with `if length is not None`. Small bug, but a clean reminder that a variable assigned conditionally inside a loop isn't guaranteed to exist when you read it.

**3. The timing / buffering race.** Even with accumulation fixed, `stats` sometimes printed nothing, because the host wrote the request and tried to read the response *before the Arduino had finished sending it*. Two fixes together: a small `time.sleep(0.05)` after writing to give the device time to respond, and `ser.reset_input_buffer()` before sending so I'm only reading the latest response and not stale bytes from a previous command. This one's insidious because it's not a logic error, the code is "correct," it's just racing the physical link.

The through-line: **the hard part of a wire protocol isn't the format, it's that the transport lies to you.** Bytes arrive late, split, or out of order, and every layer has to be written to survive that. I went in thinking checksums were the interesting part; I came out understanding that defensive *parsing* is where the real work is.

## Result
A working v1: framed protocol, XOR-checked, with a proper parser state machine on the device and an accumulating reader on the host. PING/PONG, LED control, and STATS counters all working reliably over USB. For a from-scratch protocol with no library doing the heavy lifting, that's a solid baseline, and I can see the ghost of TCP in my own design, which was exactly the point.

## Potential Future Upgrades (a.k.a. where I stopped)
Here's the honest part: the *plan* was for the working protocol to be step one, and then to make it **adversarial**, that's the half I found most interesting and, naturally, the half I haven't done yet. The roadmap I want to come back to:

1. **Attack my own protocol from the host.** Replay old frames, inject malformed ones, lie about the length field, flood the Arduino with valid-but-annoying traffic, and watch exactly how a resource-constrained device falls over. (I stubbed out `bad` and `partial` commands in the host for this and never finished wiring them up.)
2. **Sequence numbers + replay protection.** Add a SEQ byte so the device can reject duplicates and out-of-order frames, the thing that turns "it works" into "it can't be trivially spoofed."
3. **A crude MAC.** Even an HMAC-lite so the Arduino only accepts frames it can authenticate, and then break it, to feel firsthand why key storage on a microcontroller is genuinely hard.
4. **"Fail closed" behavior + rate limiting**, so a flood or a malformed frame puts the device in a safe state instead of a weird one.

That security layer is the computer-engineering-meets-cybersecurity project I actually want, and the working protocol here is the foundation for it. Filing this one honestly as *shelved*, the baseline is real and done, the fun paranoid part is future me's problem.