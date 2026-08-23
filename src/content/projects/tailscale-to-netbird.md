---
title: 'Ditching Tailscale for Self-Hosted NetBird'
description: 'Replacing the last piece of my stack I didn''t control: a self-hosted WireGuard mesh VPN with NetBird.'
pubDate: 'Aug 12 2026'
status: 'complete'
tags: ['Linux', 'NetBird', 'WireGuard', 'VPN', 'Self-Hosting', 'Homelabbing']
difficulty: 3
cost: '$0'
---

## Overview
I'd already pulled a bunch of my digital life onto my own hardware, my [calendar](/projects/selfhosted-calendar/), my [Wikipedia backup](/projects/downloading-wikipedia/), my media, all self-hosted. But every one of those was still reachable through **Tailscale**, which meant the glue holding my whole network together. The VPN, (the thing every device dials into) was still someone else's service running on someone else's coordination servers. That bugged me. If the point is to not depend on other people's infrastructure, the VPN is the *last* place you'd want a dependency.

Two concrete problems pushed me over the edge. Tailscale was **slow** for big Samba transfers (it runs userspace WireGuard and was probably relaying through their DERP servers instead of punching a direct connection), and the free plan has a **user cap** that got in the way of adding friends' devices. So I went looking for the self-hosted answer, and landed on **NetBird**, a full WireGuard mesh where I own every piece, control plane included.

## Parts / Tools
- **NetBird**, self-hosted WireGuard mesh (management + signal + relay + dashboard, all one BSD-3 project)
- My Debian 13 home server (`debianserver`) as the VPS and a peer
- Docker + Compose plugin (from Docker's official repo, not `apt install docker.io`)
- A domain for the control plane (mine's under a domain I own)
- WireGuard (the actual data path underneath it all)

## How it works
NetBird is WireGuard at the data layer, same fast kernel tunnel, with a control plane on top that solves the two things raw WireGuard doesn't: **NAT traversal** (hole punching, with a relay fallback so it works from a hotel or a phone on LTE, even behind CGNAT) and **management** (a dashboard, device names, group-based policies, setup keys instead of hand-edited config files).

I looked hard at three options before committing:

1. **Raw WireGuard**: fastest possible and rock-solid, but no NAT traversal (one side needs a reachable port), manual key management, and access control is just `AllowedIPs`. The dealbreaker: adding a device is a config-file surgery, not a click, and I wanted my phone to roam in from anywhere without port-forwarding, which a phone on cellular simply can't do.
2. **Headscale**: a self-hosted Tailscale control plane. Narrowest change from where I was, but you're assembling pieces (no built-in identity, third-party UIs, and you still need your own relay).
3. **NetBird**: the coherent whole-product self-host. Server, dashboard, clients, relay, all one project, with self-hosting treated as a first-class path. It's a heavier deployment, but it's the one that gets the third party *fully* out of the loop.

NetBird won because it's the only option where **nothing external remains**, even the relay is mine, while still giving me the click-to-add-a-device experience that made me tolerate Tailscale in the first place. It's also a *policy-filtered* mesh: peers only build tunnels a policy actually permits, so my friends' devices can reach the specific things I allow and nothing else, without me paying for n² connections across everyone.

**The topology decision that matters:** the control plane needs a stable public IP, TCP 80/443 + UDP 3478, and a domain with valid TLS. My home is behind an AT&T gateway with a dynamic WAN IP and residential ISP quirks (inbound 80 is often blocked), which breaks Let's Encrypt renewals, but luckily for me I was able to forward 80 without issue, so putting the control plane at home wasn't an awful idea. The whole time I was shooting for: **control plane and peer service on my server.**

## Software
**1. Control plane**. DNS first: an A record `netbird` → server IP, and a wildcard `*.netbird` → that host. Install Docker with the Compose plugin from Docker's official Debian repo, plus `jq` and `curl`. Then run the getting-started script:
```bash
curl -fsSL https://github.com/netbirdio/netbird/releases/latest/download/getting-started.sh | bash
```
Pick the bundled **Traefik** option so it handles Let's Encrypt automatically. A big quality-of-life win since the older guides: NetBird now ships **built-in local user management** via an embedded Dex server, so you don't need Zitadel or Auth0 anymore, you create users right in the dashboard. The script deploys with no users; you visit the domain, get sent to `/setup`, and make your admin account there.

**2. Home server as a peer:**
```bash
curl -fsSL https://pkgs.netbird.io/install.sh | sh
sudo netbird up --management-url https://<your-netbird-domain> --setup-key <KEY>
netbird status --detail
```
Using a setup key (generated in the dashboard) instead of the browser flow, since I was doing this over SSH. That brings up a `wt0` WireGuard interface, and suddenly Radicale, Jellyfin, Syncthing, all of it, are reachable at the peer's NetBird IP from anywhere.

**3. Make the home box a routing peer.** In the dashboard, advertise my LAN subnet (`192.168.1.0/24`) from that peer. That makes everything that *can't* run an agent, the printer, IoT junk, the router's own web UI, reachable over the overlay without installing anything on them.

## What broke / what I learned
This is where I earned the difficulty rating. Two real fights.

#### The Let's Encrypt cert that wouldn't issue
The control plane came up but Traefik kept serving its default self-signed cert, so `netbird up` couldn't connect over valid TLS. The cause: Traefik was configured for the **TLS-ALPN-01** ACME challenge, and something else was also contending for ALPN on port 443 (the optional proxy service I'd enabled does its own TLS-ALPN-01), two things fighting over ALPN on 443 breaks the handshake for both, so validation just kept failing.

The fix was to switch to the **HTTP-01** challenge instead, which uses port 80 and sidesteps ALPN entirely. In the compose file I swapped the `tlschallenge` resolver line for:
```yaml
- "--certificatesresolvers.letsencrypt.acme.httpchallenge=true"
- "--certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web"
```
The trap here: **Let's Encrypt rate-limits failed validations** (5 per hostname per hour), and I'd already burned several flailing at the ALPN problem. So once I had the real fix, I had to *stop retrying and wait out the window*, hammering it just extends the lockout. Painful lesson in "read the rate limit before you brute-force."

#### The routing loop that almost locked me out of SSH
This one was scary. I was SSH'd into `debianserver` *from* another machine (`mothership`) over the LAN, and right after I set up the routing peer advertising `192.168.1.0/24`, the connection started hanging. What happened: mothership received a route for my whole LAN subnet *via the tunnel* (`wt0`), so traffic to `192.168.1.3`, the box I was actively SSH'd into, suddenly went **into the NetBird tunnel** instead of straight across the LAN. And the far end of that tunnel was the same box. A perfect circular path. SSH would've died the same way.

The real fix was in the dashboard: **restrict the route's distribution group** so it doesn't include peers that are already physically on `192.168.1.0/24`. Mothership doesn't need a tunneled route to a subnet it's literally sitting on. Lesson burned in permanently: when you advertise a subnet route, exclude the peers already on that subnet, or you hand them a loop.

There was also a DNS hairpin wrinkle, the home box, as both a client and the control plane, has to reach the management server whose public name resolves to its *own* WAN IP and hairpins back. An `/etc/hosts` entry pointing the NetBird domain at the LAN IP fixed it. Works, but it's the kind of `/etc/hosts` patch that doesn't scale, a proper split-horizon DNS override is the grown-up version for later.

## Result
Every device I own; Linux machines, my phone, the home server, now rides on a single WireGuard mesh that **I run end to end**. No Tailscale, no external coordination server, no user cap. My phone roams in from cellular anywhere, calendar syncs over it, and Samba transfers are back to kernel-WireGuard speed instead of relayed-userspace crawl. Friends' devices can join with scoped, policy-limited access to exactly what I allow.

The bigger deal is what it means for the rest of my stack: this was the *last* external dependency. My calendar, my Wikipedia, my media were already self-hosted, but they were all reachable through someone else's VPN. Now the glue is mine too. The whole thing depends on nothing but hardware I control and open-source software.

## Potential Future Upgrades
- **DNS-01 ACME with a Cloudflare token.** The durable fix for the cert problem, needs no inbound ports at all (so an AT&T IP change can't break renewals) and it's the only way to get a real wildcard cert. Scoped token, Zone:DNS:Edit only. The move once I'm not mid-debug.
- **A local resolver for split-horizon DNS**, to retire the `/etc/hosts` hack across every LAN device at once.
- **DDNS on the home peer**, since the residential WAN IP will rotate eventually.
- **Onboard the friend group properly**: setup keys per person, policies scoping each group to only the services they should see (Minecraft servers yes, Samba absolutely never).