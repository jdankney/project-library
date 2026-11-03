import type { Update } from './history';
import { diffProse, statBar, type ProseDiff } from './prose-diff';

/** A pre-git version from a post's `history:` frontmatter. */
export interface PreGit {
	version: string;
	/** 'YYYY-MM' or 'YYYY-MM-DD'. */
	date: string;
	note: string;
}

export type LogEntry =
	| {
			kind: 'update';
			hash: string;
			short: string;
			date: string;
			version: string | null;
			summary: string;
			diff: ProseDiff;
			bar: { plus: number; minus: number };
	  }
	| { kind: 'pre-git'; date: string; version: string; note: string }
	| { kind: 'published'; date: string };

export interface PostLog {
	entries: LogEntry[];
	/** Newest marked update's date, for the UPDATED meta item. */
	updated: Date | null;
	/** Show the log at all: only when there's more than the automatic "published" line. */
	show: boolean;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'Oct 31 2026' (UTC, so builds in any timezone agree). */
export function formatDay(d: Date): string {
	return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()} ${d.getUTCFullYear()}`;
}

/** '2026-07' → 'Jul 2026'; '2026-07-04' → 'Jul 4 2026'. */
export function formatPreGitDate(date: string): string {
	const [y, m, d] = date.split('-').map(Number);
	return d ? `${MONTHS[m - 1]} ${d} ${y}` : `${MONTHS[m - 1]} ${y}`;
}

/** Midnight local time on a 'YYYY-MM-DD' day, so date formatting shows that day in any timezone. */
function localDay(day: string): Date {
	const [y, m, d] = day.split('-').map(Number);
	return new Date(y, m - 1, d);
}

/** Everything a post's update log shows, newest first. */
export function buildLog(updates: Update[], history: PreGit[] | undefined, pubDate: Date): PostLog {
	const entries: LogEntry[] = updates.map((u) => {
		const diff = diffProse(u.oldBody, u.newBody);
		return {
			kind: 'update',
			hash: u.hash,
			short: u.hash.slice(0, 7),
			date: formatPreGitDate(u.day),
			version: u.version,
			summary: u.summary,
			diff,
			bar: statBar(diff.added, diff.removed),
		};
	});
	if (history?.length) {
		for (const h of [...history].reverse()) {
			entries.push({ kind: 'pre-git', date: formatPreGitDate(h.date), version: h.version, note: h.note });
		}
	} else {
		entries.push({ kind: 'published', date: formatDay(pubDate) });
	}
	return { entries, updated: updates[0] ? localDay(updates[0].day) : null, show: updates.length > 0 || !!history?.length };
}
