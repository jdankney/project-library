import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HistoryError, postBody, readUpdates, unknownMarkerSlugs } from './history';

let repo: string;
let day = 0;
const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
const post = (slug: string, body: string, title = slug) =>
	`---\ntitle: '${title}'\npubDate: 'Dec 23 2025'\n---\n${body}`;
function commit(message: string, files: Record<string, string>) {
	for (const [name, content] of Object.entries(files)) writeFileSync(join(repo, 'posts', name), content);
	git('add', '-A');
	day++;
	const date = `2026-01-${String(day).padStart(2, '0')}T12:00:00Z`;
	execFileSync('git', ['commit', '-q', '-m', message], {
		cwd: repo,
		env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
	});
	return git('rev-parse', 'HEAD').trim();
}
const file = (name: string) => join(repo, 'posts', name);

beforeEach(() => {
	repo = mkdtempSync(join(tmpdir(), 'updates-'));
	day = 0;
	git('init', '-q');
	git('config', 'user.email', 'test@example.com');
	git('config', 'user.name', 'test');
	git('config', 'commit.gpgsign', 'false');
	mkdirSync(join(repo, 'posts'));
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe('postBody', () => {
	it('drops the frontmatter and trims, exactly like Astro', () => {
		expect(postBody("---\ntitle: 'x'\n---\n\n## Overview\ntext\n\n")).toBe('## Overview\ntext');
	});

	it('handles CRLF files and files with no frontmatter', () => {
		expect(postBody('---\r\ntitle: x\r\n---\r\nbody')).toBe('body');
		expect(postBody('just text')).toBe('just text');
	});
});

describe('readUpdates', () => {
	it('returns nothing for a post with no marked commits', () => {
		commit('add post', { 'a.md': post('a', 'one\n') });
		commit('fix typo', { 'a.md': post('a', 'one!\n') });
		expect(readUpdates(file('a.md'))).toEqual([]);
	});

	it('reads a marked update with its version, summary, date and bodies', () => {
		commit('add post', { 'a.md': post('a', 'one\n') });
		const hash = commit('update(a): v0.2 two', { 'a.md': post('a', 'one\n\ntwo\n') });
		const [u, ...rest] = readUpdates(file('a.md'));
		expect(rest).toEqual([]);
		expect(u).toEqual({
			hash,
			date: new Date('2026-01-02T12:00:00Z'),
			day: '2026-01-02',
			version: 'v0.2',
			summary: 'two',
			oldBody: 'one',
			newBody: 'one\n\ntwo',
		});
	});

	it('diffs the first update against the commit just before it, not the first commit', () => {
		commit('add post', { 'a.md': post('a', 'draft\n') });
		commit('site update: pictures', { 'a.md': post('a', 'published\n') });
		commit('update(a): more', { 'a.md': post('a', 'published\n\nmore\n') });
		expect(readUpdates(file('a.md'))[0].oldBody).toBe('published');
	});

	it('folds unmarked edits between two marked updates into the later one', () => {
		commit('add post', { 'a.md': post('a', 'one\n') });
		commit('update(a): first', { 'a.md': post('a', 'one\n\ntwo\n') });
		commit('typo', { 'a.md': post('a', 'one\n\ntwo!\n') });
		commit('update(a): second', { 'a.md': post('a', 'one\n\ntwo!\n\nthree\n') });
		const [second, first] = readUpdates(file('a.md'));
		expect(second.summary).toBe('second');
		expect(second.oldBody).toBe('one\n\ntwo');
		expect(second.newBody).toBe('one\n\ntwo!\n\nthree');
		expect(first.summary).toBe('first');
	});

	it('only counts markers that name this post', () => {
		commit('add posts', { 'a.md': post('a', 'a\n'), 'b.md': post('b', 'b\n') });
		commit('update(b): b only', { 'a.md': post('a', 'a2\n'), 'b.md': post('b', 'b2\n') });
		commit('update(a, b): both', { 'a.md': post('a', 'a3\n'), 'b.md': post('b', 'b3\n') });
		expect(readUpdates(file('a.md')).map((u) => u.summary)).toEqual(['both']);
		expect(readUpdates(file('b.md')).map((u) => u.summary)).toEqual(['both', 'b only']);
	});

	it('follows renames and accepts markers that use the old slug', () => {
		commit('add post', { 'old-name.md': post('x', 'one\n') });
		commit('update(old-name): before rename', { 'old-name.md': post('x', 'one\n\ntwo\n') });
		renameSync(file('old-name.md'), file('new-name.md'));
		commit('rename post', {});
		commit('update(new-name): after rename', { 'new-name.md': post('x', 'one\n\ntwo\n\nthree\n') });
		const updates = readUpdates(file('new-name.md'));
		expect(updates.map((u) => u.summary)).toEqual(['after rename', 'before rename']);
		expect(updates[0].oldBody).toBe('one\n\ntwo');
	});

	it('finds a marked commit that renames and edits the post at once', () => {
		commit('add post', { 'old.md': post('x', 'one\n') });
		renameSync(file('old.md'), file('new.md'));
		writeFileSync(file('new.md'), post('x', 'one\n\ntwo\n'));
		commit('update(new): renamed and extended', {});
		expect(readUpdates(file('new.md'))).toMatchObject([{ summary: 'renamed and extended', oldBody: 'one', newBody: 'one\n\ntwo' }]);
	});

	it('finds a marked commit that reached the branch through a --no-ff merge', () => {
		commit('add post', { 'a.md': post('a', 'one\n') });
		git('checkout', '-q', '-b', 'side');
		commit('update(a): from a branch', { 'a.md': post('a', 'one\n\ntwo\n') });
		git('checkout', '-q', '-');
		execFileSync('git', ['merge', '-q', '--no-ff', '-m', 'Merge branch side', 'side'], {
			cwd: repo,
			env: { ...process.env, GIT_AUTHOR_DATE: '2026-02-01T12:00:00Z', GIT_COMMITTER_DATE: '2026-02-01T12:00:00Z' },
		});
		expect(readUpdates(file('a.md')).map((u) => u.summary)).toEqual(['from a branch']);
	});

	it("records the calendar day in the author's own timezone, not UTC", () => {
		commit('add post', { 'a.md': post('a', 'one\n') });
		writeFileSync(file('a.md'), post('a', 'one\n\ntwo\n'));
		git('add', '-A');
		// 4:23 pm on Nov 2 in California is already Nov 3 in UTC
		const when = '2026-11-02T16:23:11-08:00';
		execFileSync('git', ['commit', '-q', '-m', 'update(a): evening edit'], {
			cwd: repo,
			env: { ...process.env, GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when },
		});
		expect(readUpdates(file('a.md'))[0].day).toBe('2026-11-02');
	});

	it('keeps a frontmatter-only marked commit, with equal bodies', () => {
		commit('add post', { 'a.md': post('a', 'one\n', 'Node V1.0') });
		commit('update(a): renumbered', { 'a.md': post('a', 'one\n', 'Node V0.3') });
		const [u] = readUpdates(file('a.md'));
		expect(u.oldBody).toBe(u.newBody);
	});

	it('treats a post whose first commit is marked as added from nothing', () => {
		commit('update(a): v0.1 first write-up', { 'a.md': post('a', 'one\n') });
		expect(readUpdates(file('a.md'))[0]).toMatchObject({ oldBody: '', newBody: 'one' });
	});

	it('throws a HistoryError outside a git repo', () => {
		const loose = mkdtempSync(join(tmpdir(), 'nogit-'));
		writeFileSync(join(loose, 'a.md'), post('a', 'one\n'));
		try {
			expect(() => readUpdates(join(loose, 'a.md'))).toThrow(HistoryError);
			expect(() => readUpdates(join(loose, 'a.md'))).toThrow(/README: Publishing a post update/);
		} finally {
			rmSync(loose, { recursive: true, force: true });
		}
	});
});

describe('unknownMarkerSlugs', () => {
	it('lists marker slugs no post has ever had', () => {
		commit('add post', { 'a.md': post('a', 'one\n') });
		const typo = commit('update(a, aa): typo in the second slug', { 'a.md': post('a', 'two\n') });
		expect(unknownMarkerSlugs(join(repo, 'posts'))).toEqual([{ hash: typo, slug: 'aa' }]);
	});

	it('accepts slugs a post used to have', () => {
		commit('add post', { 'old.md': post('x', 'one\n') });
		renameSync(file('old.md'), file('new.md'));
		commit('rename', {});
		commit('update(old): late marker with the old name', { 'new.md': post('x', 'two\n') });
		expect(unknownMarkerSlugs(join(repo, 'posts'))).toEqual([]);
	});
});
