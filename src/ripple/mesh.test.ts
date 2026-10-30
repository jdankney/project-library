import { describe, expect, it } from 'vitest';
import { Mesh, type MeshOptions, type Relay } from './mesh';

const opts: MeshOptions = { rangePx: 150, pxPerStep: 2, processingSteps: 10, relayFalloff: 0.82 };

/** Run the mesh clock forward and collect every relay with the step it fired on. */
function runUntil(mesh: Mesh, lastStep: number): (Relay & { step: number })[] {
	const out: (Relay & { step: number })[] = [];
	for (let step = 1; step <= lastStep; step++) for (const r of mesh.tick(step)) out.push({ ...r, step });
	return out;
}

describe('Mesh', () => {
	it('never relays from an antenna out of range', () => {
		const mesh = new Mesh([{ id: 'far', x: 500, y: 0 }], opts);
		mesh.transmit({ x: 0, y: 0 }, 3, 1);
		expect(runUntil(mesh, 2000)).toEqual([]);
		expect(mesh.busy).toBe(false);
	});

	it('relays when the wavefront arrives plus processing time', () => {
		const mesh = new Mesh([{ id: 'b', x: 100, y: 0 }], opts);
		mesh.transmit({ x: 0, y: 0 }, 3, 1);
		// 100px at 2px/step = 50 steps, plus 10 processing steps
		expect(mesh.tick(59)).toEqual([]);
		expect(mesh.tick(60)).toEqual([{ nodeId: 'b', x: 100, y: 0, hopsLeft: 2, strength: 0.82 }]);
	});

	it('relays each packet at most once per antenna', () => {
		const nodes = [
			{ id: 'a', x: 0, y: 0 },
			{ id: 'b', x: 60, y: 0 },
			{ id: 'c', x: 30, y: 50 },
		];
		const mesh = new Mesh(nodes, opts);
		mesh.transmit({ x: 30, y: 20 }, 5, 1);
		const ids = runUntil(mesh, 2000).map((r) => r.nodeId);
		expect(ids.sort()).toEqual(['a', 'b', 'c']);
	});

	it('stops at the hop limit', () => {
		const chain = [0, 100, 200, 300].map((x, i) => ({ id: `n${i}`, x, y: 0 }));
		const mesh = new Mesh(chain, opts);
		mesh.transmit({ x: 0, y: 0 }, 2, 1, 'n0');
		const relays = runUntil(mesh, 2000);
		expect(relays.map((r) => [r.nodeId, r.hopsLeft])).toEqual([
			['n1', 1],
			['n2', 0],
		]);
	});

	it('weakens the signal at every hop', () => {
		const chain = [0, 100, 200].map((x, i) => ({ id: `n${i}`, x, y: 0 }));
		const mesh = new Mesh(chain, opts);
		mesh.transmit({ x: 0, y: 0 }, 3, 1, 'n0');
		const [first, second] = runUntil(mesh, 2000);
		expect(first.strength).toBeCloseTo(0.82);
		expect(second.strength).toBeCloseTo(0.82 * 0.82);
	});

	it('never has the transmitting antenna relay its own packet', () => {
		const mesh = new Mesh([{ id: 'self', x: 0, y: 0 }], opts);
		mesh.transmit({ x: 0, y: 0 }, 3, 1, 'self');
		expect(runUntil(mesh, 500)).toEqual([]);
	});

	it('reports busy only while relays are pending', () => {
		const mesh = new Mesh([{ id: 'b', x: 100, y: 0 }], opts);
		expect(mesh.busy).toBe(false);
		mesh.transmit({ x: 0, y: 0 }, 1, 1);
		expect(mesh.busy).toBe(true);
		runUntil(mesh, 500);
		expect(mesh.busy).toBe(false);
	});

	it('forgets in-flight packets when the antennas change', () => {
		const mesh = new Mesh([{ id: 'b', x: 100, y: 0 }], opts);
		mesh.transmit({ x: 0, y: 0 }, 3, 1);
		mesh.setNodes([{ id: 'z', x: 900, y: 900 }]);
		expect(mesh.busy).toBe(false);
		expect(runUntil(mesh, 500)).toEqual([]);
	});
});
