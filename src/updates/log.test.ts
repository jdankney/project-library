import { describe, expect, it } from 'vitest';
import type { Update } from './history';
import { buildLog, formatDay, formatPreGitDate } from './log';

const update = (over: Partial<Update>): Update => ({
	hash: 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0',
	date: new Date('2026-10-31T18:00:00Z'),
	version: null,
	summary: 'renumbered to v0.3, install still ahead',
	oldBody: '##### V1.0\n- XL4016\n',
	newBody: '##### V0.3\n- XL4016\n',
	...over,
});
const pub = new Date('2025-12-23T00:00:00Z');
const history = [
	{ version: 'v0.1', date: '2025-12', note: 'Altoids tin' },
	{ version: 'v0.2', date: '2026-05', note: 'Gefen shell' },
	{ version: 'v0.3', date: '2026-07', note: 'XL4016 buck' },
];

describe('formatting', () => {
	it('formats days in UTC and pre-git dates at the precision given', () => {
		expect(formatDay(new Date('2026-10-31T23:30:00Z'))).toBe('Oct 31 2026');
		expect(formatPreGitDate('2026-07')).toBe('Jul 2026');
		expect(formatPreGitDate('2026-07-04')).toBe('Jul 4 2026');
	});
});

describe('buildLog', () => {
	it('lists real updates newest first, then pre-git history newest first', () => {
		const log = buildLog([update({})], history, pub);
		expect(log.entries.map((e) => (e.kind === 'update' ? e.short : `${e.kind}:${'version' in e ? e.version : ''}`))).toEqual([
			'a1b2c3d',
			'pre-git:v0.3',
			'pre-git:v0.2',
			'pre-git:v0.1',
		]);
		expect(log.updated).toEqual(new Date('2026-10-31T18:00:00Z'));
		expect(log.show).toBe(true);
	});

	it('uses an automatic "published" entry when there is no history', () => {
		const log = buildLog([], undefined, pub);
		expect(log.entries).toEqual([{ kind: 'published', date: 'Dec 23 2025' }]);
		expect(log.updated).toBeNull();
		expect(log.show).toBe(false);
	});

	it('shows the log for history alone, before any real update', () => {
		expect(buildLog([], history, pub).show).toBe(true);
	});

	it('gives each update its diff and stat bar', () => {
		const [entry] = buildLog([update({})], undefined, pub).entries;
		expect(entry.kind).toBe('update');
		if (entry.kind !== 'update') return;
		expect(entry.diff.hunks[0].heading).toBe('##### V0.3');
		expect(entry.bar).toEqual({ plus: 1, minus: 1 });
	});

	it('gives a frontmatter-only update an empty diff', () => {
		const [entry] = buildLog([update({ oldBody: 'a\n', newBody: 'a\n' })], undefined, pub).entries;
		expect(entry.kind === 'update' && entry.diff.hunks).toEqual([]);
	});
});
