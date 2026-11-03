import { describe, expect, it } from 'vitest';
import { splitBlocks } from './blocks';

describe('splitBlocks', () => {
	it('splits on blank lines and keeps 1-based line ranges', () => {
		expect(splitBlocks('## Overview\ntext one\n\npara two\n')).toEqual([
			{ text: '## Overview\ntext one', start: 1, end: 2 },
			{ text: 'para two', start: 4, end: 4 },
		]);
	});

	it('keeps a fenced code block whole even with blank lines inside', () => {
		const body = 'intro\n\n```\na\n\nb\n```\n\nafter';
		expect(splitBlocks(body).map((b) => [b.start, b.end])).toEqual([
			[1, 1],
			[3, 7],
			[9, 9],
		]);
	});

	it('treats whitespace-only lines as blank and handles CRLF', () => {
		expect(splitBlocks('a\r\n   \r\nb').map((b) => b.text)).toEqual(['a', 'b']);
	});

	it('returns nothing for an empty body', () => {
		expect(splitBlocks('')).toEqual([]);
	});
});
