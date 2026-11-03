import { describe, expect, it } from 'vitest';
import { lineChanges, lineMap, marksCss, marksFor, topLevelBlocks, updateMarks } from './line-marks';

describe('lineChanges', () => {
	it('tells added lines from replaced ones', () => {
		const ch = lineChanges('a\nb\nc\n', 'a\nB\nc\nd\n');
		expect([...ch.lines]).toEqual([
			[2, 'chg'],
			[4, 'add'],
		]);
		expect(ch.removedAt).toEqual([]);
	});

	it('does not mark the old last line when text is added after it (trimmed bodies)', () => {
		expect([...lineChanges('a', 'a\n\nb').lines]).toEqual([
			[2, 'add'],
			[3, 'add'],
		]);
	});

	it('records where removed lines used to be', () => {
		expect(lineChanges('a\nb\nc\n', 'a\nc\n').removedAt).toEqual([2]);
		expect(lineChanges('a\nb\n', 'a\n').removedAt).toEqual([2]);
	});
});

describe('lineMap', () => {
	it('maps surviving lines and zeroes deleted ones', () => {
		expect(lineMap('a\nb\nc\n', 'x\na\nc\n')).toEqual([0, 2, 0, 3]);
	});
});

describe('topLevelBlocks', () => {
	it('matches the Markdown parser: a loose list is one block, fenced code is one block', () => {
		const body = '## Parts\n- one\n\n- two\n\n```\ncode\n\nmore\n```\n';
		expect(topLevelBlocks(body)).toEqual([
			{ start: 1, end: 1 },
			{ start: 2, end: 4 },
			{ start: 6, end: 10 },
		]);
	});
});

describe('marksFor', () => {
	const body = '## A\npara one\n\nnew para\n\nlast\n';
	it('marks a fully new block as add and a partly touched one as chg', () => {
		const marks = marksFor(lineChanges('## A\npara 1\n\nlast\n', body), body);
		// a heading and the line under it are separate blocks
		expect(marks.has(1)).toBe(false);
		expect(marks.get(2)).toEqual({ kind: 'chg' });
		expect(marks.get(4)).toEqual({ kind: 'add' });
		expect(marks.has(6)).toBe(false);
	});

	it('puts a removal notch on the block after the gap, or the bottom of the last block', () => {
		const old = '## A\npara one\n\ngone\n\nlast\n\ntail\n';
		const now = '## A\npara one\n\nlast\n';
		const marks = marksFor(lineChanges(old, now), now);
		// 'gone' sat above 'last'; 'tail' sat after it at the very end
		expect(marks.get(4)).toEqual({ rmTop: true, rmBottom: true });
		const marks2 = marksFor(lineChanges('a\n\nb\n', 'a\n'), 'a\n');
		expect(marks2.get(1)).toEqual({ rmBottom: true });
	});

	it('treats a line removed from the middle of a block as a change to that block', () => {
		const now = '- one\n- three\n';
		expect(marksFor(lineChanges('- one\n- two\n- three\n', now), now).get(1)).toEqual({ kind: 'chg' });
	});
});

describe('updateMarks', () => {
	it('marks the newest update in the current numbering', () => {
		const v1 = 'intro\n\n## Result\nworks\n';
		const v2 = 'intro\n\n## Result\nworks well\n';
		const marks = updateMarks([{ hash: 'b', oldBody: v1, newBody: v2 }], v2);
		expect([...marks.get('b')!]).toEqual([[4, { kind: 'chg' }]]);
	});

	it('carries an older update forward past lines inserted above it later', () => {
		const v0 = 'intro\n\nold para\n';
		const v1 = 'intro\n\nold para\n\nadded in v1\n';
		const v2 = 'new top para\n\nintro\n\nold para\n\nadded in v1\n';
		const marks = updateMarks(
			[
				{ hash: 'v2', oldBody: v1, newBody: v2 },
				{ hash: 'v1', oldBody: v0, newBody: v1 },
			],
			v2,
		);
		expect([...marks.get('v1')!]).toEqual([[7, { kind: 'add' }]]);
		expect([...marks.get('v2')!]).toEqual([[1, { kind: 'add' }]]);
	});

	it('drops an older mark whose block was deleted by a later update', () => {
		const v0 = 'a\n';
		const v1 = 'a\n\nb\n';
		const v2 = 'a\n';
		const marks = updateMarks(
			[
				{ hash: 'v2', oldBody: v1, newBody: v2 },
				{ hash: 'v1', oldBody: v0, newBody: v1 },
			],
			v2,
		);
		expect([...marks.get('v1')!]).toEqual([]);
	});

	it('follows unmarked edits made after the newest update', () => {
		const v1 = 'a\n\nb\n';
		const current = 'typo fix on top\n\na\n\nb\n';
		const marks = updateMarks([{ hash: 'v1', oldBody: 'a\n', newBody: v1 }], current);
		expect([...marks.get('v1')!]).toEqual([[5, { kind: 'add' }]]);
	});

	it('gives a frontmatter-only update no marks', () => {
		expect([...updateMarks([{ hash: 'x', oldBody: 'a\n', newBody: 'a\n' }], 'a\n').get('x')!]).toEqual([]);
	});
});

describe('marksCss', () => {
	it('writes one rule per kind, scoped to top-level post blocks', () => {
		const css = marksCss(
			new Map([
				[1, { kind: 'add' }],
				[5, { kind: 'chg', rmTop: true }],
				[9, { rmBottom: true }],
			]),
		);
		expect(css).toBe(
			[
				'.post-body > [data-line="1"] { --upd-bar: var(--upd-add); }',
				'.post-body > [data-line="5"] { --upd-bar: var(--upd-chg); }',
				'.post-body > [data-line="9"] { --upd-rm: block; --upd-rm-y: calc(100% - 0.3rem); }',
				'.post-body > [data-line="5"] { --upd-rm: block; --upd-rm-y: -0.35rem; }',
			].join('\n'),
		);
	});

	it('is empty when there is nothing to mark', () => {
		expect(marksCss(new Map())).toBe('');
	});
});
