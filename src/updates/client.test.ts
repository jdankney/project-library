import { describe, expect, it } from 'vitest';
import { showingFor } from './client';

describe('showingFor', () => {
	it('shows the open entry while the log is open', () => {
		expect(showingFor({ logOpen: true, openEntry: 'b2', newest: 'a1' })).toBe('b2');
	});

	it('falls back to the newest when no entry is open', () => {
		expect(showingFor({ logOpen: true, openEntry: null, newest: 'a1' })).toBe('a1');
	});

	it('falls back to the newest when the whole log is collapsed, even with an older entry still open inside', () => {
		expect(showingFor({ logOpen: false, openEntry: 'b2', newest: 'a1' })).toBe('a1');
	});
});
