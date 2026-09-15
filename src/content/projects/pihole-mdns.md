---
title: 'Local DNS with Pi-hole (and Why I Ripped It Back Out)'
description: 'I set up Pi-hole to give my devices real names instead of IP addresses. It worked: but I still tore it down. Here''s why.'
pubDate: 'Mar 3 2026'
status: 'shelved'
tags: ['Linux', 'Pi-hole', 'DNS', 'Networking', 'Homelabbing']
difficulty: 2
cost: '$0'
---

## Overview
I was tired of memorizing IP addresses. Every device on my network, the Pi, the NAS, the cameras, all lived at some `192.168.1.x` I had to remember, and I wanted to just type `raspi.test` or `nas.test` and have it work, like a real network. The tool for that is **local DNS**: run your own DNS server, tell it that `raspi.test` means `192.168.1.10`, and every device asks it instead of the internet.

I went with **Pi-hole** on a Raspberry Pi (it does local DNS records *and* ad-blocking, so I figured two birds). And here's the honest headline: **I got it fully working, and then I tore it out anyway.** This is a writeup of a project I decided wasn't worth keeping, which turned out to be a more useful thing to learn than if it had just worked.

## Parts / Tools
- Raspberry Pi (static IP `192.168.1.10`)
- **Pi-hole** (DNS + local DNS records)
- An **AT&T residential gateway** — the villain of this whole story
- `.test` / `.home.arpa` domains (the TLDs actually reserved for this, so you're not hijacking a real one)

`$0`, it's all software on hardware I already had. The cost turned out to be paid in time, not money.

## How it works
DNS is just a lookup: your device wants `raspi.test`, it asks a DNS server "what's the IP for that," and uses whatever comes back. The trick with local DNS is that *your* server answers for names that never leave your house. You're not faking anything; inside your network, you're the authority. Set `raspi.test → 192.168.1.10` in Pi-hole and every device that asks Pi-hole now resolves it instantly.

The intended setup is clean:
1. Pi-hole runs on the Pi at a static IP.
2. The router hands out the Pi's IP as the DNS server over DHCP.
3. Pi-hole answers local names itself and forwards everything else (real internet domains) upstream.

That's the version that works on a normal router. Mine is not a normal router.

## What broke / what I learned
The concept worked on the first try, a `dig blog.test` against the Pi came back with the right IP in 3ms. The *concept* was never the problem. Everything that made this miserable was my AT&T gateway fighting me, and it stacked up.

**1. The AT&T router won't hand out a custom DNS server.** The whole plan hinges on step 2; the router telling every device "use the Pi for DNS" via DHCP. AT&T's residential gateways just... don't let you do that cleanly. The DNS is effectively hardwired to AT&T's own servers. The LAN device names in the UI are cosmetic; they never become real resolvable DNS. So the router quietly ignores the one setting the entire design depends on.

**2. Which forces manual DNS on every single device.** With the router refusing to push the Pi, the only way to actually *use* Pi-hole is to go to each device (laptop, desktop, phone, every machine) and manually set its DNS to `192.168.1.10` by hand. That's the death of the whole idea. The entire point was convenience; a system where onboarding a new device means digging through its network settings is *less* convenient than just remembering the IP I was trying to avoid. And any device I forgot, or any guest, or anything on DHCP just silently doesn't get the local names.

**3. AT&T injects its own IPv6 DNS behind your back.** Even on devices where I *did* set the Pi manually, pages would still sometimes resolve wrong, because the AT&T box was handing out its own IPv6 DNS servers over the top. So I'd be fighting a second, invisible DNS path, turning off IPv6 per device or manually overriding IPv6 DNS too, just to keep control. Another manual step, on every device, forever.

**4. And it made everything feel laggier.** This is the one that actually killed it. With Pi-hole in the path, every new page load starts with a DNS lookup that goes to the Pi first, and for any real internet domain the Pi then forwards upstream and waits, Pi -> AT&T -> internet -> back. That extra hop is milliseconds on paper, but you *feel* it as pages being slower to start loading, that little beat before anything happens. It didn't slow my actual download speeds, DNS doesn't touch throughput, but it added latency to the front of every connection, and across a whole day of browsing it made the network feel worse, not better. I'd added a middleman to fix a naming annoyance and paid for it on every single request.

The lesson: **DNS only resolves names, it doesn't move your traffic**, so "Pi-hole slowed my network" isn't quite right, it slowed the *start* of every connection. But knowing exactly which kind of slow it was is the difference between a vague complaint and understanding what you built.

## Result
I ripped it out. Pi-hole is gone, and I'm back to plain IP addresses, which, it turns out, I mostly have memorized anyway for the handful of devices I actually touch.

The honest accounting: the value was "type names instead of IPs," and the cost was manual DNS config on every device, an ongoing IPv6-injection fight with the ISP, and a latency tax on every page load. On a router that cooperates, this is a genuinely great setup and I'd run it in a heartbeat. On an AT&T gateway that hardwires its own DNS, the juice wasn't worth the squeeze. Sometimes the right engineering call is to undo the thing.

## Potential Future Upgrades
Not upgrades to *this* so much as the two ways I'd actually revisit the goal, both of which route around the real problem (the router):

1. **Put the AT&T box in passthrough/DMZ mode and run my own router** (OpenWRT/pfSense) behind it. Then *my* router does DHCP + DNS properly, hands out the Pi as DNS to everything automatically, and the whole "manual per-device" problem disappears. This is the real fix, the AT&T gateway was always the blocker, so the answer is to demote it to a dumb modem.
2. **Skip Pi-hole and just use `/etc/hosts`** on the two or three machines I actually care about naming. No server, no latency, no DHCP fight; it doesn't scale, but for "I want `nas.test` on my main desktop," it's honestly the right-sized tool. I was reaching for a network-wide solution to a three-device problem.

For now, though: plain IPs, no middleman, and a much better understanding of why my ISP's router is the way it is.