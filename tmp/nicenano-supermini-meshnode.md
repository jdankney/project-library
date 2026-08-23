---
title: 'DIY Meshtastic Mobile Node (nRF52840 + LoRa + GPS) V1.0'
description: 'Buiding a low-current Meshtastic node for my Audi A4 featuring a nRF52840, DX-LR30 (SX1262), and a uBloc NEO-M8N.'
pubDate: 'Dec 23 2025'
status: 'in-progress'
tags: ['nRF52840', 'LoRa', 'GPS', 'Meshtastic']
difficulty: 4
cost: '~$35 in total ($3.88 nRF52840 | $5.85 DX-LR30 | $14.76 NEO-M8N | $5.50 XL4016 | $5 BD-E5400)'
---

> **Before reading this post:**
> This article is written assuming that the reader already has a basic understanding of [Meshtastic](https://meshtastic.org/), [Meshtastic Nodes](https://meshtastic.org/docs/overview/), and the [Meshtastic Protocol](https://meshtastic.org/docs/getting-started/).

## Overview
I wanted to create a BLE-based mobile [Meshtastic](https://meshtastic.org/) node from scratch, and it went over quite the many iterations before it got to where I'd call V1.0. It started with a basic microcontroller + LoRa radio in an Altoids container and later developed into a full blown mobile platform for development. By adding a single buck converter and GPS module, the node now just needs only a power source (which I aquired from tapping a fuse in my car,) rather than a USB connection + seperate power for 3.3V rail + multiple buck converters.

## Parts
V0.1
- nRF52840 MCU (I chose this board because of its ultra-low idle current)
- DX-LR30 LoRa Module (SX1262, I used RXEN/TXEN instead of DIO2 as switch)
- Altoids Tin
V0.2
- nRF52840
- DX-LR30
- u-blox NEO-M8N GPS Module
- Mini360 / MP2307 buck converter (14V/12V --> 5V)
- Gefen VGA to DVI Scaler Plus
V1.0
- nRF52840
- DX-LR30
- NEO-M8N
- XL4016
- Samsung BD-E5400 (All internals removed, just used as a chasis)

## How it works
#### V0.1
I started this project by researching what hardware would fit my use case the best. For this project and it's mobile (vehicle-based) nature, I was looking for a microcontroller that uses the least amount of power yet still has plenty of capability for the node itself.

This led me to the nRF52840, which is a multi-protocol System-on-Chip (SoC) designed for short-range wireless applications particularly with support for Bluetooth 5.3. It features a 64 MHz ARM Cortex-M4 processor, 1 MB of Flash memory, and 256 kB of RAM, making it suitable for many different kinds of complex applications.  
Specifically, I chose the "SuperMini" clone of the nRF52840 due to it being a solid, semi-well documented clone of the original chip at a fraction of the price.

My SuperMini nRF52840 (nRF52840 Clone) top-down
![nrf_topdown](../../assets/media/nrf_mesh_v1/nrf_topdown.jpg)  
My SuperMini nRF52840 bottom-up
![nrf_bottomup](../../assets/media/nrf_mesh_v1/nrf_bottomup.jpg)

And for the LoRa Radio chip, I wanted the SX1262 due to its improved performance over the previous generations of the SX12xx chips. Specifically, I chose the DX-LR30 which is just the bare SX1262 IC on a dev board.

My DX-LR30 Datasheet
![dxlr30_datasheet](../../assets/media/nrf_mesh_v1/dxlr30_datasheet.jpg)

With these two components alone, I was able to create a mockup of the V0.1 mobile node. The hardware and wiring was fairly simple, especially since it was powered via USB. The firmware, however, was where I had the most trouble.  
After approximately a month of on and off working on the firmware (due to my Uni classes, I was unable to spend a meaningful amount of time each week working on the firmware, which is why it took such a large amount of time) the node powered up and was able to cleanly communicate between the MCU and the radio chip.  
Due to the simple nature and small size of the V0,1 mobile node, I was able to fit it into a modified Altoids tin with no problems.

V0.1 Mobile Node Open
![altoids_open](../../assets/media/nrf_mesh_v1/altoids_open.jpg)

V0.1 Mobile Node Closed
![altoids_closed](../../assets/media/nrf_mesh_v1/altoids_closed.jpg)

At this point, the mobile node just worked, no questions asked. I was able to text and receive messages like anyone else on the network, but I knew that I couldn't stop there. Due to the sheer amount of [Meshtastic supported Telemetry sensors](https://meshtastic.org/docs/configuration/module/telemetry/), I wanted to add more to the node to move away from such a basic configuration (limited to basic sending/receiving of messages,) to something that has sensor data that is useful to me and my friends.

Which led me to:
#### V0.2
This version added an uBloc NEO-M8N to the previous version (nRF52840 + DX-LR30), which unfortunately was a little more in depth than I thought. This is where the Altoids tin began to prove to be a problem, because even though I was able to actually fit everything inside of the tin, the thermal conditions as well as the interior conductivity of the enclosure led to my .
What I used instead was a Gefen VGA to DVI Scaler Plus, or more specifcally, the shell of a Gefen VGA to DVI Scaler Plus. 


## What broke / what I learned


## Firmware


## Result
