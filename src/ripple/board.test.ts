import { describe, expect, it } from 'vitest';
import { layerAlpha, paintBoard } from './board';
import { buildLayout } from './layout';

/** A canvas whose 2D context records every property it is given and every method called on it. */
function recordingCanvas() {
	const assigned = new Set<string>();
	const called = new Set<string>();
	const ctx = new Proxy({} as Record<string, unknown>, {
		get(_target, prop: string) {
			if (prop === 'createLinearGradient') return () => ({ addColorStop() {} });
			return () => void called.add(prop);
		},
		set(_target, prop: string) {
			assigned.add(prop);
			return true;
		},
	});
	const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
	return { canvas, assigned, called };
}

const layout = buildLayout({
	mode: 'hero',
	width: 1200,
	height: 600,
	seed: 1,
	parts: ['ESP32-S3', 'SX1262'],
	avoid: [{ x: 100, y: 150, w: 600, h: 300 }],
	quiet: null,
	mounts: [{ rect: { x: 850, y: 160, w: 230, h: 288 }, ref: 'J1', label: 'jdankney.jpg' }],
});

describe('paintBoard', () => {
	it('sizes the canvas for the device pixel ratio', () => {
		const { canvas } = recordingCanvas();
		paintBoard(canvas, layout, 2);
		expect([canvas.width, canvas.height]).toEqual([2400, 1200]);
	});

	it('never uses ctx.filter, so the dim zones work in Safari', () => {
		const { canvas, assigned, called } = recordingCanvas();
		paintBoard(canvas, layout, 1);
		expect(called.has('fillRect')).toBe(true);
		expect(assigned.has('filter')).toBe(false);
	});
});

describe('layerAlpha', () => {
	it('stacks up to the requested opacity', () => {
		for (const target of [0.55, 0.96]) expect(1 - (1 - layerAlpha(target, 12)) ** 12).toBeCloseTo(target, 6);
	});
});
