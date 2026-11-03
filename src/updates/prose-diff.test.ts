import { describe, expect, it } from 'vitest';
import { diffProse, displayText, statBar } from './prose-diff';

describe('displayText', () => {
	it('strips link targets, emphasis, code markers and heading hashes', () => {
		expect(displayText('## The [mobile node](/projects/x/) is **really** `fast` and _small_')).toBe(
			'The mobile node is really fast and small',
		);
	});

	it('keeps snake_case and lone asterisks alone', () => {
		expect(displayText('set max_retries to 3 * 2')).toBe('set max_retries to 3 * 2');
	});

	it('turns list markers into bullets and blockquote markers into nothing', () => {
		expect(displayText('- one\n2. two\n> quoted')).toBe('• one\n• two\nquoted');
	});

	it('names inline images by file', () => {
		expect(displayText('Photo  \n![alt](../../assets/media/x/gefen.jpg)')).toBe('Photo\n[image: gefen.jpg]');
	});

	it('shows fenced code without its fences', () => {
		expect(displayText('```\n10W panel --> PWM\n```')).toBe('10W panel --> PWM');
	});
});

describe('diffProse', () => {
	it('finds no hunks for identical bodies', () => {
		expect(diffProse('a\n\nb\n', 'a\n\nb\n')).toEqual({ hunks: [], added: 0, removed: 0 });
	});

	it('word-diffs a lightly edited paragraph under its heading', () => {
		const old = '## Result\nThe node has been up for a month now.\n';
		const now = '## Result\nThe node has been up for 9 weeks now.\n';
		const { hunks, added, removed } = diffProse(old, now);
		expect(hunks).toHaveLength(1);
		expect(hunks[0].heading).toBe('## Result');
		const [block] = hunks[0].blocks;
		expect(block.kind).toBe('changed');
		if (block.kind !== 'changed') return;
		expect(block.parts.filter((p) => p.op === 'del').map((p) => p.text.trim())).toEqual(['a month']);
		expect(block.parts.filter((p) => p.op === 'ins').map((p) => p.text.trim())).toEqual(['9 weeks']);
		expect([added, removed]).toEqual([2, 2]);
	});

	it('labels an added paragraph with the heading it falls under', () => {
		const { hunks } = diffProse('## Parts\nlist\n\n## Result\nworks\n', '## Parts\nlist\n\n## Result\nworks\n\nWinter update: fine.\n');
		expect(hunks).toEqual([{ heading: '## Result', blocks: [{ kind: 'added', text: 'Winter update: fine.' }] }]);
	});

	it('labels changes above the first heading as (intro)', () => {
		expect(diffProse('hello\n', 'hello there\n').hunks[0].heading).toBe('(intro)');
	});

	it('shows a mostly rewritten paragraph as removed + added, not a word soup', () => {
		const { hunks } = diffProse('Totally different words here today.\n', 'Nothing in common with before at all.\n');
		expect(hunks[0].blocks.map((b) => b.kind)).toEqual(['removed', 'added']);
	});

	it('reports a renamed heading as one whole-word swap labelled with its new name', () => {
		const { hunks } = diffProse('##### V1.0\n- XL4016\n', '##### V0.3\n- XL4016\n');
		expect(hunks[0].heading).toBe('##### V0.3');
		expect(hunks[0].blocks[0]).toEqual({
			kind: 'changed',
			parts: [
				{ op: 'del', text: 'V1.0' },
				{ op: 'ins', text: 'V0.3' },
				{ op: 'eq', text: '\n• XL4016' },
			],
		});
	});

	it('reports image-only blocks as one line', () => {
		expect(diffProse('a\n', 'a\n\n![x](../media/bench-v2.jpg)\n').hunks[0].blocks).toEqual([
			{ kind: 'image', op: 'added', to: 'bench-v2.jpg' },
		]);
		expect(diffProse('a\n\n![x](old.jpg)\n', 'a\n\n![x](new.jpg)\n').hunks[0].blocks).toEqual([
			{ kind: 'image', op: 'replaced', from: 'old.jpg', to: 'new.jpg' },
		]);
		expect(diffProse('a\n\n![x](old.jpg)\n', 'a\n').hunks[0].blocks).toEqual([
			{ kind: 'image', op: 'removed', from: 'old.jpg' },
		]);
	});

	it('groups several changes in one section into one hunk', () => {
		const { hunks } = diffProse(
			'## A\nthe first paragraph here\n\nthe second one\n\nthe third paragraph here\n',
			'## A\nthe first paragraph here!\n\nthe second one\n\nthe third paragraph, edited\n',
		);
		expect(hunks).toHaveLength(1);
		expect(hunks[0].blocks).toHaveLength(2);
	});

	it('ignores whitespace-only reflows', () => {
		expect(diffProse('one two\nthree\n', 'one two three\n').hunks).toEqual([]);
	});

	it('treats everything as added when there was no old body', () => {
		const d = diffProse('', '## Overview\nhi there\n');
		expect(d.removed).toBe(0);
		expect(d.added).toBe(3);
		expect(d.hunks[0].heading).toBe('## Overview');
	});
});

describe('statBar', () => {
	it('shows exact counts when they fit', () => {
		expect(statBar(4, 1)).toEqual({ plus: 4, minus: 1 });
	});
	it('scales to the width and never hides a nonzero side', () => {
		expect(statBar(50, 50)).toEqual({ plus: 5, minus: 5 });
		expect(statBar(1000, 1)).toEqual({ plus: 9, minus: 1 });
		expect(statBar(1, 1000)).toEqual({ plus: 1, minus: 9 });
	});
});

describe('changed-block parts', () => {
	it('joins neighbouring word changes into one removed run and one added run', () => {
		const [block] = diffProse('up for a month now\n', 'up for 9 weeks now\n').hunks[0].blocks;
		expect(block).toEqual({
			kind: 'changed',
			parts: [
				{ op: 'eq', text: 'up for ' },
				{ op: 'del', text: 'a month' },
				{ op: 'ins', text: '9 weeks' },
				{ op: 'eq', text: ' now' },
			],
		});
	});
});

describe('context trimming', () => {
	const long = 'one two three four five six seven eight nine ten eleven twelve';
	it('keeps 8 words of context before and after a change, cut with …', () => {
		const [block] = diffProse(`${long} OLD ${long}\n`, `${long} NEW ${long}\n`).hunks[0].blocks;
		expect(block).toEqual({
			kind: 'changed',
			parts: [
				{ op: 'eq', text: '…five six seven eight nine ten eleven twelve ' },
				{ op: 'del', text: 'OLD' },
				{ op: 'ins', text: 'NEW' },
				{ op: 'eq', text: ' one two three four five six seven eight…' },
			],
		});
	});

	it('cuts the middle of a long run between two changes', () => {
		const middle = `${long} ${long}`;
		const [block] = diffProse(`A ${middle} B\n`, `X ${middle} Y\n`).hunks[0].blocks;
		expect(block.kind === 'changed' && block.parts[2]).toEqual({
			op: 'eq',
			text: ' one two three four five six seven eight … five six seven eight nine ten eleven twelve ',
		});
	});

	it('leaves short context alone', () => {
		const [block] = diffProse('up for a month now\n', 'up for 9 weeks now\n').hunks[0].blocks;
		expect(block.kind === 'changed' && block.parts.map((p) => p.text)).toEqual(['up for ', 'a month', '9 weeks', ' now']);
	});
});
