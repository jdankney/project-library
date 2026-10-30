import { describe, expect, it } from 'vitest';
import { hashString, mulberry32 } from './rng';

describe('mulberry32', () => {
	it('repeats the same sequence for the same seed', () => {
		const a = mulberry32(42);
		const b = mulberry32(42);
		const seqA = Array.from({ length: 50 }, a);
		const seqB = Array.from({ length: 50 }, b);
		expect(seqA).toEqual(seqB);
	});

	it('gives a different sequence for a different seed', () => {
		const a = Array.from({ length: 5 }, mulberry32(1));
		const b = Array.from({ length: 5 }, mulberry32(2));
		expect(a).not.toEqual(b);
	});

	it('stays in [0, 1)', () => {
		const r = mulberry32(7);
		for (let i = 0; i < 10_000; i++) {
			const v = r();
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThan(1);
		}
	});
});

describe('hashString', () => {
	it('matches the FNV-1a reference values', () => {
		expect(hashString('')).toBe(0x811c9dc5);
		expect(hashString('a')).toBe(0xe40c292c);
	});

	it('gives different seeds for different slugs', () => {
		expect(hashString('esp32s3-solar-meshnode')).not.toBe(hashString('pihole-mdns'));
	});
});
