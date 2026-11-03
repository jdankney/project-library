import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const projects = defineCollection({
	// Project write-ups live in src/content/ (not src/pages/) so they're loaded
	// as content rather than published as their own routes.
	loader: glob({ base: './src/content/projects', pattern: '**/*.md' }),
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			description: z.string(),
			pubDate: z.coerce.date(),
			heroImage: z.optional(image()),

			// ---- project-specific fields (all optional so older posts still build) ----
			// Where the project stands right now.
			status: z.enum(['complete', 'in-progress', 'shelved']).optional(),
			// Short topic tags, e.g. ['ESP32', 'PWM', 'BLE']
			tags: z.array(z.string()).default([]),
			// Link to source code, if any.
			repo: z.string().url().optional(),
			// Rough build difficulty, 1-5.
			difficulty: z.number().min(1).max(5).optional(),
			// One-line "what this cost me" summary, e.g. "~$12 in parts"
			cost: z.string().optional(),
			// Versions from before the post was in git, oldest first. Shown in the
			// update log as `pre-git` entries (see README: Publishing a post update).
			history: z
				.array(
					z.object({
						version: z.string().min(1),
						// YAML reads 2026-07-04 as a date and 2026-07 as a string; accept both
						date: z.preprocess(
							(v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v),
							z.string().regex(/^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/, 'use YYYY-MM or YYYY-MM-DD'),
						),
						note: z.string().min(1),
					}),
				)
				.optional(),
		}),
});

export const collections = { projects };
