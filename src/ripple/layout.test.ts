import { describe, expect, it } from 'vitest';
import { buildLayout, DEFAULT_PARTS, distToRect, parseParts, type LayoutInput } from './layout';

const hero = (seed = 1): LayoutInput => ({
	mode: 'hero',
	width: 1440,
	height: 680,
	seed,
	parts: ['ESP32-S3', 'SX1262', 'BME680'],
	avoid: [{ x: 115, y: 150, w: 720, h: 380 }],
	quiet: null,
	mounts: [{ rect: { x: 1022, y: 196, w: 230, h: 288 }, ref: 'J1', label: 'jdankney.jpg' }],
});

const page = (width = 1440, seed = 7): LayoutInput => ({
	mode: 'page',
	width,
	height: 900,
	seed,
	parts: ['LoRa', 'BME680'],
	avoid: [],
	quiet: { x: (width - 876) / 2, y: 0, w: 876, h: 900 },
	mounts: [],
});

const blockedRects = (input: LayoutInput) => [...input.avoid, ...(input.quiet ? [input.quiet] : []), ...input.mounts.map((m) => m.rect)];

describe('buildLayout', () => {
	it('is deterministic for the same seed and geometry', () => {
		expect(buildLayout(hero(3))).toEqual(buildLayout(hero(3)));
		expect(buildLayout(page(1440, 9))).toEqual(buildLayout(page(1440, 9)));
	});

	it('routes a different board for a different seed', () => {
		expect(buildLayout(hero(3)).traces).not.toEqual(buildLayout(hero(4)).traces);
	});

	it('keeps antennas and chips off text, the quiet column, and mounts', () => {
		for (const input of [hero(1), hero(2), hero(3), page(1440, 1), page(1920, 2)]) {
			const l = buildLayout(input);
			for (const b of blockedRects(input)) {
				for (const n of l.nodes) expect(distToRect(n.x, n.y, b)).toBeGreaterThanOrEqual(30);
				for (const c of l.chips) expect(distToRect(c.x, c.y, b)).toBeGreaterThanOrEqual(c.size / 2);
			}
		}
	});

	it('keeps every trace inside the board across its run', () => {
		for (const input of [hero(1), hero(5), page(1440, 3)]) {
			const { traces, width: W, height: H } = buildLayout(input);
			for (const t of traces) {
				const ysInside = t.points.every(([, y]) => y >= 0 && y <= H);
				const xsInside = t.points.every(([x]) => x >= 0 && x <= W);
				expect(ysInside || xsInside).toBe(true);
			}
		}
	});

	it('puts four antennas on a desktop hero', () => {
		for (const seed of [1, 2, 3, 4, 5]) expect(buildLayout(hero(seed)).nodes).toHaveLength(4);
	});

	it('gives antennas unique ids', () => {
		const ids = buildLayout(hero()).nodes.map((n) => n.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('labels chips with the given parts, in order', () => {
		const input = hero();
		const chips = buildLayout(input).chips;
		expect(chips.length).toBeGreaterThan(0);
		expect(chips.map((c) => c.part)).toEqual(input.parts.filter((p) => chips.some((c) => c.part === p)));
		expect(chips.map((c) => c.ref)).toEqual(chips.map((_, i) => `U${i + 1}`));
	});

	it('leaves margins too narrow to show anything empty', () => {
		const l = buildLayout(page(1000));
		expect(l.nodes).toEqual([]);
		expect(l.chips).toEqual([]);
	});

	it('fans each mount out into 16 traces', () => {
		const withMount = buildLayout(hero());
		const without = buildLayout({ ...hero(), mounts: [] });
		expect(withMount.traces.length - without.traces.length).toBe(16);
	});

	it('dims hero text lightly and the page column almost solid', () => {
		expect(buildLayout(hero()).dims.map((d) => d.alpha)).toEqual([0.55]);
		const pageDims = buildLayout(page()).dims;
		expect(pageDims).toHaveLength(1);
		expect(pageDims[0].alpha).toBeGreaterThan(0.9);
	});
});

describe('parseParts', () => {
	it('reads a JSON list of part names', () => {
		expect(parseParts('["LoRa","BME680"]')).toEqual(['LoRa', 'BME680']);
	});

	it('falls back to the default parts for missing, empty, or malformed values', () => {
		for (const raw of [undefined, '', '[]', '{bad', '[1,2]', '"LoRa"']) expect(parseParts(raw)).toEqual(DEFAULT_PARTS);
	});
});
