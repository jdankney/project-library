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
			updatedDate: z.coerce.date().optional(),
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
		}),
});

export const collections = { projects };
