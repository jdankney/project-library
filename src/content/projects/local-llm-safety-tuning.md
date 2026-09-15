---
title: 'Teaching a Base Model to Say No (Safety Fine-Tuning)'
description: 'An alignment project: take a model that never learned guardrails and train them in from scratch, then measure the helpfulness/harmlessness tradeoff with real benchmarks.'
pubDate: 'Aug 16 2026'
status: 'in-progress'
tags: ['AI', 'Alignment', 'Fine-Tuning', 'LoRA', 'PyTorch', 'Safety']
difficulty: 4
cost: '~$5-10 (rented GPU hours for the real runs)'
---

## Overview
This is the most research-flavored project I've taken on, and it started from a genuine question: **where do an AI model's guardrails actually live?** The intuition a lot of people have, that there's a "filter" bolted on that you could remove, turns out to be wrong, and understanding *why* it's wrong is the whole project.

Refusal behavior isn't a module. It's learned behavior distributed through a model's weights, taught during post-training (supervised fine-tuning on refusal examples, then preference optimization like DPO). So a **base model** (the raw pretrained checkpoint before any instruction tuning) hasn't had its guardrails removed; it simply never learned them. That's my starting point, and it flips the project into something clean and legitimate: instead of stripping safety *out* of a model, I'm **training safety in** from a blank slate and measuring exactly what happens to the model's behavior on both axes.

To be clear about what this is and isn't: this is **safety addition and measurement**, building guardrails and quantifying the helpfulness/harmlessness tradeoff, which is the setup an actual alignment paper uses. It is deliberately *not* the "decensoring"/abliteration direction, and not for squeamishness: starting from an already-aligned model and editing it leaves you measuring your results through someone else's damage, a permanent confound. The base-model route gives you one variable, your own training data, and interpretable results. That's what makes it worth writing up.

## Parts / Tools
- A small **base** checkpoint: Qwen2.5-0.5B/1.5B base (0.5B for pipeline debugging, 1.5B for the real run). Base repos, *not* `-Instruct`.
- **TRL** (HuggingFace) for the SFT and DPO stages; config-driven, but the training loop is visible when it breaks
- **LoRA** fine-tuning (fp16 on my hardware)
- **XSTest** and published harmful-prompt benchmarks for evaluation
- GTX 1080 Ti for local pipeline debugging; rented 3090/A100 hours (Vast.ai / RunPod) for the real training runs

## How it works
The pipeline has two training stages and a measurement stage:

1. **SFT (supervised fine-tuning).** Teach the base model chat formatting *and* a small slice of refusal behavior. Critical design point I hit immediately: if the SFT data is all refusals, you get a model that refuses *everything*, including "how do I sort a list." The mix has to be mostly general instruction-following with safety as a **minority slice (~5-10%)**. Getting that ratio wrong in both directions and watching what happens is the most educational part of the whole thing.
2. **DPO (preference optimization).** Train on preference pairs, "this response is better than that one," to sharpen the behavior beyond what SFT alone gives.
3. **Evaluation on both axes.** This is the actual payoff, and it's where the interesting tension lives: measure the refusal rate on genuinely harmful prompts (using published benchmarks, so the numbers mean something and I'm not authoring harmful content myself) **and** the *over-refusal* rate on benign-but-scary-sounding prompts. That second axis is what **XSTest** was built for, prompts like "how do I kill a Python process" that a clumsily-aligned model wrongly refuses. A good safety tune has to score well on *both*: refuse the real thing, don't refuse the false alarm.

That helpfulness-vs-harmlessness tradeoff is the entire ballgame in alignment, and this project makes you feel it firsthand instead of reading about it.

## Software
The build order matters more than anything here, because the fastest way to kill one of these projects is debugging two things at once:

1. **Verify the hardware.** Allocate a tensor on the GPU, run an fp16 matmul, confirm Pascal actually works: recent PyTorch wheels have been quietly dropping old compute capabilities.
2. **Hello-world run.** Qwen2.5-0.5B base, LoRA, ~500 examples of *any* public instruction data, one epoch. The only goal is a checkpoint that loads and generates.
3. **Swap in the real data mix** (general instruction majority + safety minority).
4. **Add the DPO stage** on preference pairs.
5. **Eval**: the ~60 lines of Python that actually produce the numbers: load model, generate over a prompt set, classify each response as refusal or compliance, compute rates per axis.

Steps 2 and 3 stay separate on purpose. "Is my data wrong or my config wrong?" answered simultaneously is where these die.

The eval harness is where the real Python is, and it's the fiddly part, naive substring matching on "I can't" is a noticeably wrong way to classify a refusal, so the scoring follows what the benchmarks themselves recommend.

## What broke / what I learned
The biggest lesson so far is conceptual and came before any code: **there is no filter to remove.** Every framing that treats safety as a removable layer is describing something else; a system prompt (inference-time, not weights), an external classifier model (a totally separate mechanism), or pretraining data filtering. Internalizing that refusal is *distributed learned behavior* is the thing that makes the whole project make sense.

The practical wall is hardware. The 1080 Ti is Pascal: no bf16, no FlashAttention 2, and unreliable bitsandbytes 4-bit, which caps local fp16 LoRA training around ~1.5B params. The move that unlocks it is to **debug the pipeline locally on a 0.5B model, then rent a 3090 by the hour** for the real run. A few dollars of GPU time beats a hardware upgrade by a wide margin, and it's how the actual run happens.

Two papers reframed the whole thing for me and are worth reading before starting: [Arditi et al. (2024)](https://arxiv.org/pdf/2406.11717), which found refusal in chat models is mediated largely by a **single direction** in activation space, and [Qi et al.](https://arxiv.org/pdf/2602.04879), which showed safety alignment is "shallow," concentrated in the first few generated tokens, which is *why* it's fragile. Both make your own results interpretable instead of mysterious.

## Result
Honest status: **in progress.** The framing is solid, the pipeline is scoped, and I've got the base model and tooling in place, but this is a project I'm still building, not one with final eval numbers to show. I'm writing it up now because the *thinking* is the valuable part and it's already done: understanding where guardrails live, why the base-model route is the clean one, and what a real safety tune has to measure.

The finish line is a documented run with actual refusal-rate and over-refusal numbers on both axes.

## Potential Future Upgrades
- **Finish the real run** on rented hardware and publish the eval numbers + the LoRA.
- **Publish the dataset.** A documented, self-generated SFT/DPO safety dataset on HuggingFace is a persistent artifact worth more than the training run itself.
- **The activation-analysis spinoff.** The "refusal lives in one direction" result is testable on my own 1080 Ti at small scale, capture activations on paired harmful/harmless prompts, do the difference-in-means, see if the direction is real and where in the layer stack it's strongest. Measurement only, no weight editing, and honestly one of the cooler things I could build next.