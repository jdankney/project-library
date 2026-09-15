---
title: 'Running a 35B LLM on a GPU That Shouldn''t'
description: 'Getting a 35B model generating at 23 tok/s on a 6GB laptop card: MoE expert offload, Pascal quirks, and learning exactly where the hardware ceiling is.'
pubDate: 'Aug 21 2026'
status: 'complete'
tags: ['LLM', 'llama.cpp', 'CUDA', 'Pascal', 'Self-Hosting', 'AI']
difficulty: 3
cost: '$0'
---

## Overview
I got into running LLMs locally, and the fun of it (for me) is doing it on hardware that has no business running them. I've got a **GTX 1660 Ti** (6GB) in my MSI laptop, which the internet will tell you is too old and too small for anything interesting. The whole project was proving that wrong, and in the process actually understanding *why* these cards are slow, instead of just reading that they are.

The headline result: I got **Qwen3.6-35B-A3B**, a **35-billion**-parameter model, generating at **~23 tok/s on the 6GB laptop card.** A 35B model on 6GB of VRAM sounds impossible. The trick is that it isn't really running 35B at once.

## Parts / Tools
- GTX 1660 Ti (6GB, Turing): MSI GF65 laptop, 40GB system RAM (8+32)
- `llama.cpp` (compiled from source), plus Ollama / LM Studio for the easy path
- GGUF quantized models (Q4_K_M and friends)

`$0`: the whole point was using cards I already had.

## How it works
Two ideas do all the heavy lifting.

**Quantization.** You don't run these models at full fp16, you run GGUF quants (Q4_K_M, ~4-5 bits per weight). That shrinks an 8B model to ~5GB, which fits on the GPU with room for context. This is what makes any of it possible on consumer cards.

**MoE expert offload: the real trick.** Qwen3.6-35B-A3B is a **mixture-of-experts** model: 35B total parameters, but only ~3B are *active* per token. So instead of needing all 35B in VRAM, you keep the attention layers and the KV cache on the GPU (where speed matters) and park the giant stack of mostly-idle expert weights in system RAM. `llama.cpp` does this with `--n-cpu-moe`:

```bash
llama-server -m Qwen3.6-35B-A3B-UD-Q4_K_XL.gguf \
  -ngl 99 --n-cpu-moe 35 -c 16384 -fa --no-mmap
```

`-ngl 99` puts every layer it can on the GPU, and `--n-cpu-moe 35` pushes 35 layers' worth of experts out to RAM. You walk that number until it just barely fits in VRAM. On the 6GB laptop with 40GB of RAM, a ~21GB model fits fine; 3B active parameters per token is what keeps it usable.

## What broke / what I learned
This is where the project actually taught me computer architecture instead of just "type the command."

**My Turing card has no tensor cores, and that shapes everything.** The 1660 Ti (TU116, compute 7.5) can *store* fp16 fitne, but its fp16 *arithmetic* runs at 1/64 the fp32 rate. What it does have is **DP4A**: a 4-way INT8 dot-product instruction running at ~4× fp32, and that's exactly the math quantized GGUF models use. So the card is genuinely fine at Q4/Q8 generation, but *prompt processing* (which leans on fp16) is roughly 5× slower than a modern card. The lesson: on Turing you keep prompts and context lean, because prefill is where you feel he missing tensor cores.

To get the most out of it I compiled `llama.cpp` myself with Pascal-specific flags:
```
-DCMAKE_CUDA_ARCHITECTURES=61 -DGGML_CUDA_FORCE_MMQ=ON
```
`FORCE_MMQ` routes matmuls through the integer (MMQ) kernels instead of cuBLAS fp16, which is the whole point on a card whose fp16 is crippled.

**The bottleneck isn't the GPU, it's memory bandwidth.** When I benchmarked the 6GB laptop, I got ~23 tok/s generation and ~109 tok/s prompt processing, and then found that compiler flags and build tweaks moved those numbers *not at all* (within error bars). That's the real lesson: with MoE offload, generation speed is bounded by how fast you can stream expert weights out of **DDR4 system RAM**, not by the GPU. My laptop runs 8+32GB in flex mode: 16GB dual-channel plus 24GB single-channel, and the single-channel portion is the actual ceiling. A matched 2×32GB kit (full dual-channel) is the one upgrade that would actually move generation speed, because it's a pure bandwidth problem.

**Driver EOL is the real expiration date.** Turing's last driver branch is 580, so the card isn't limited by any inability to do 4-bit math, it's limited by the fact that prebuilt binaries will eventually stop shipping `sm_61` kernels and I'll be compiling my own against older CUDA forever. Good to know *before* you build a homelab around old cards.

## Result
A 35B model generating at reading speed on a 6GB laptop GPU, and a genuine understanding of why; quantization to fit, MoE offload to cheat the VRAM limit, DP4A to make Pascal's integer path do the work its fp16 can't, and a hard memory-bandwidth ceiling that no software flag can move. I went in wanting fast tokens and came out understanding the actual architecture of why a card is fast or slow, which was worth more than the tokens.

For anyone with an old card: you can do far more than the "you need a 4090" crowd claims; a 7-9B model at Q4 runs comfortably on 8-11GB, and MoE models let you punch way above your VRAM. You just have to understand what your specific silicon is good and bad at.

## Potential Future Upgrades
- **Matched dual-channel RAM** on the laptop, the single upgrade that would actually raise MoE generation speed, since it's bandwidth-bound.
- **Consolidate onto the server.** My Debian box is the natural home for an always-on local inference endpoint the rest of my network can hit, same self-hosting logic as everything else here.
- **Feed my own projects.** A local model with my project notes loaded is the eventual goal, a private, offline assistant that actually knows my homelab.