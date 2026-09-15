---
title: 'Cloning GLaDOS (Voice Synthesis + Post-Processing)'
description: 'Building a GLaDOS voice with local TTS: and learning that GLaDOS isn''t a voice, it''s a human plus an effects chain.'
pubDate: 'Aug 13 2026'
status: 'complete'
tags: ['AI', 'TTS', 'Voice Cloning', 'ComfyUI', 'Audio']
difficulty: 2
cost: '$0'
---

## Overview
I wanted [GLaDOS](https://half-life.fandom.com/wiki/GLaDOS). Specifically I wanted to be able to type a line and have it come out in her voice, for future video projects, and honestly just because it's cool. So I set up a local text-to-speech pipeline in ComfyUI and cloned her, and the most interesting thing I learned is buried in the premise: **GLaDOS isn't a voice. She's Ellen McLain plus an effects chain.** Getting that distinction right is the whole project.

## Parts / Tools
- **ComfyUI** with **[TTS-Audio-Suite](https://github.com/diodiogod/TTS-Audio-Suite)** (bundles RVC, Chatterbox, F5-TTS and others behind one node set)
- GTX 1080 Ti for local generation
- Portal 2 GLaDOS voice lines (from the Portal Wiki archive) as reference audio
- Audacity for the post-processing effects pass

`$0`: local models, free tools, game audio I already had access to.

## How it works
The pipeline splits into two halves that people constantly conflate: **clone the human, then add the machine.**

**The voice half (TTS).** Zero-shot cloning takes a short reference clip (3-15 seconds of clean speech) plus the text you want spoken, and synthesizes it in that voice; no training. The suite uses a two-node pattern that trips up newcomers: an **engine node** configures, and a separate **TTS node** generates, with the engine plugging *into* the TTS node. Feed it a reference clip of GLaDOS and it clones the underlying vocal timbre.

**The effects half (post).** Here's the key realization: a voice model **cannot learn effects.** RVC and zero-shot cloning pick up the static coloration baked into the reference (formant shifts, the midrange scoop), so you get maybe 60-70% of the way to "robotic" for free. But the time-varying, nonlinear stuff; ring modulation sidebands, the vocoder carrier, her signature stutters, all have to be rebuilt by hand afterward. So the raw clone comes out sounding like Ellen McLain (a normal human voice), and the robot layer goes on last in Audacity: subtle ring modulation, a comb-filter/flanger touch, a midrange EQ scoop, and a short plate reverb. The stutters are manual edits, not an effect.

## What broke / what I learned
**Portal solved the hardest problem for me: sourcing.** Normally the pain of voice cloning is that game dialogue is buried under music, SFX, and baked-in reverb, and the clone will learn the reverb *as part of the voice*. But Valve ships GLaDOS's lines as clean, isolated WAVs, and the Portal Wiki archives them all, so I skipped the whole ripping-and-separating stage. The corollary that surprised me: **do not clean the effects off the reference clip.** You feed it the game audio as-is, because that baked-in coloration is exactly the part the model *can* learn for free.

**Use Portal 2, not Portal 1.** P1 GLaDOS is much more heavily vocoded, which makes it poor conditioning material (the model tries to learn the distortion as voice and gets confused.) Portal 2 is cleaner and there's far more of it.

**Building the reference clip is the actual work.** I pulled 8-10 Portal 2 lines with even pacing and no laughter or overlapping SFX, trimmed the silence, normalized, and concatenated them into one ~10-15 second mono WAV. That file is the foundation of everything downstream, so it's worth doing carefully. A matching transcript matters too, some engines align the reference audio against it, and a wrong transcript degrades the clone noticeably.

**GLaDOS is 80% delivery, not timbre.** The passive-aggressive pauses, the flat sincerity, the way she lands a threat like a weather report, zero-shot TTS gives you the voice with *none* of the menace. Pacing is controlled indirectly: the reference clip's rhythm is the biggest lever (feed it her slowest deliveries and pace follows), then punctuation in the text (ellipses and em-dashes stretch the pauses), then the engine's `exaggeration` setting (lower = flatter and more measured, which is more her). Her signature pauses are deliberate, so you write them in.

**A workflow near-miss worth flagging:** TTS node packs pull in specific transformers/torch/torchaudio versions, and installing an audio suite on top of a working image-gen ComfyUI is the single most common way people nuke their setup. I cloned a second ComfyUI install for audio rather than risk the diffusion environment, cost some disk, saved a rebuild.

## Result
A working local GLaDOS pipeline: type a line, get it in her cloned voice, run the Audacity effects pass, and it comes out convincingly robotic. It's the kind of tool that's equal parts genuinely useful (for video projects down the line) and pure fun to have built. And I came away understanding voice synthesis as a real two-stage problem: clone the performer then synthesize the machine, rather than a single magic button.

## Potential Future Upgrades
- **The Portal turrets.** Their lines are short ("Hello?", "Target lost"), below the reference window, so I'd concatenate several into one clip, then it's the same clone-the-human, add-the-machine principle, but with a pitch/formant shift up and a narrow bandpass to get the little-speaker sound.
- **Save the effects chain as a preset** (or automate it outside ComfyUI) so the robot layer isn't a manual Audacity pass every time.
- **RVC over zero-shot** for better delivery, record *myself* performing the line for pacing and emphasis, then convert the timbre, which is how you get the menace zero-shot can't.

*(Note on ethics/legality: these voices belong to working actors (Ellen McLain,) and some places now have synthetic-likeness laws. Personal experimentation is fine; publishing or monetizing a cloned voice is where it gets genuinely messy, and I'd like to get properly informed before doing either.)*