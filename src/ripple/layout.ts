import { mulberry32, type Rng } from './rng';
import type { AntennaNode, BoardLayout, Chip, DimZone, Mount, Point, Rect, Trace } from './types';

export interface LayoutInput {
	mode: 'hero' | 'page';
	width: number;
	height: number;
	seed: number;
	/** Chip silkscreen labels, in order. */
	parts: string[];
	/** Hero text blocks: board dimmed beneath, nothing placed on them. */
	avoid: Rect[];
	/** Page text column: board dimmed almost solid, nothing placed on it. */
	quiet: Rect | null;
	mounts: Mount[];
}

export const DEFAULT_PARTS = ['ESP32-S3', 'SX1262', 'BME680', 'nRF52840'];

export const TRACE_PITCH = 9;
/** Footprint outline distance from the mounted photo's edge. */
export const MOUNT_PAD = 16;
export const MOUNT_PINS = 8;
export const MOUNT_PIN_PITCH = 18;

/** Bus centrelines stay this far from the board edges they run along. */
const EDGE = 32;
/** Antenna pad keep-out radius: dashed ring plus a little air. */
const NODE_CLEAR = 34;
/** Room above and below a mount for its outline, pads, and labels. */
const MOUNT_CLEAR = MOUNT_PAD + 40;
/** How far a mount's pin fan-out reaches sideways before it joins the bus. */
const MOUNT_FANOUT = 180;
/** Narrowest page margin that gets antennas and chips. */
const MIN_MARGIN = 120;

/** Parse the `data-parts` attribute; anything unusable falls back to the default parts. */
export function parseParts(raw: string | undefined): string[] {
	try {
		const v: unknown = JSON.parse(raw ?? '');
		if (Array.isArray(v) && v.length > 0 && v.every((p) => typeof p === 'string')) return v;
	} catch {
		// fall through
	}
	return DEFAULT_PARTS;
}

export function inflate(r: Rect, by: number): Rect {
	return { x: r.x - by, y: r.y - by, w: r.w + 2 * by, h: r.h + 2 * by };
}

/** Distance from a point to the nearest point of a rect (0 when inside). */
export function distToRect(x: number, y: number, r: Rect): number {
	const dx = Math.max(r.x - x, 0, x - (r.x + r.w));
	const dy = Math.max(r.y - y, 0, y - (r.y + r.h));
	return Math.hypot(dx, dy);
}

/** Shift a polyline sideways by `off`, keeping parallel spacing through the bends (miter joins). */
function offsetPolyline(pts: Point[], off: number): Point[] {
	const normal = (a: Point, b: Point): Point => {
		const dx = b[0] - a[0];
		const dy = b[1] - a[1];
		const l = Math.hypot(dx, dy) || 1;
		return [-dy / l, dx / l];
	};
	return pts.map((p, i) => {
		const prev = pts[i - 1];
		const next = pts[i + 1];
		let n: Point;
		if (!prev) n = normal(p, next);
		else if (!next) n = normal(prev, p);
		else {
			const n1 = normal(prev, p);
			const n2 = normal(p, next);
			let mx = n1[0] + n2[0];
			let my = n1[1] + n2[1];
			const ml = Math.hypot(mx, my) || 1;
			mx /= ml;
			my /= ml;
			const d = mx * n1[0] + my * n1[1];
			n = [mx / d, my / d];
		}
		return [p[0] + n[0] * off, p[1] + n[1] * off];
	});
}

/** Straight runs joined by 45° jogs, like an autorouted bus. Starts and ends past the board edge. */
function route(rng: Rng, along: number, across: number, start: number, horizontal: boolean): Point[] {
	const P = (a: number, b: number): Point => (horizontal ? [a, b] : [b, a]);
	const lo = EDGE;
	const hi = across - EDGE;
	let a = -40;
	let b = Math.min(Math.max(start, lo), hi);
	const pts: Point[] = [P(a, b)];
	while (a < along + 40) {
		a += 70 + rng() * 230;
		pts.push(P(a, b));
		if (a > along + 40) break;
		let d = (22 + rng() * 64) * (rng() < 0.5 ? -1 : 1);
		if (b + d < lo || b + d > hi) d = -d;
		if (b + d < lo || b + d > hi) continue; // too thin to jog either way
		a += Math.abs(d);
		b += d;
		pts.push(P(a, b));
	}
	return pts;
}

interface BusSpec {
	horizontal: boolean;
	/** Position across the board, 0..1. */
	at: number;
	/** Traces in the bus, at most 6 (keeps offset traces inside the EDGE margin). */
	count: number;
}

function busTraces(rng: Rng, W: number, H: number, spec: BusSpec): Trace[] {
	const along = spec.horizontal ? W : H;
	const across = spec.horizontal ? H : W;
	if (across < 2 * EDGE + 40) return [];
	const base = route(rng, along, across, spec.at * across, spec.horizontal);
	const traces: Trace[] = [];
	for (let i = 0; i < spec.count; i++) {
		let points = offsetPolyline(base, (i - (spec.count - 1) / 2) * TRACE_PITCH);
		let via = false;
		if (rng() < 0.28 && points.length > 3) {
			points = points.slice(0, 2 + Math.floor(rng() * (points.length - 2)));
			via = true;
		}
		traces.push({ points, alpha: 0.38 + rng() * 0.2, via });
	}
	return traces;
}

/** Pins down both sides of a mount, fanned in to a 9px-pitch bus that runs off the board edge. */
function mountTraces(m: Mount, W: number): Trace[] {
	const r = m.rect;
	const cy = r.y + r.h / 2;
	const out: Trace[] = [];
	for (const side of [-1, 1]) {
		const edge = side < 0 ? r.x - MOUNT_PAD : r.x + r.w + MOUNT_PAD;
		for (let i = 0; i < MOUNT_PINS; i++) {
			const k = i - (MOUNT_PINS - 1) / 2;
			const py = cy + k * MOUNT_PIN_PITCH;
			const ty = cy + k * TRACE_PITCH;
			const x0 = edge + side * 10;
			const x1 = x0 + side * 16;
			const x2 = x1 + side * Math.abs(py - ty);
			const x3 = x2 + side * (60 + Math.abs(k) * 4);
			out.push({
				points: [
					[x0, py],
					[x1, py],
					[x2, ty],
					[x3, ty],
					[x3 + side * 40, ty + 40],
					[side < 0 ? -20 : W + 20, ty + 40],
				],
				alpha: 0.6,
				via: false,
			});
		}
	}
	return out;
}

interface Taken {
	x: number;
	y: number;
	r: number;
}

/** Rejection-sample up to `count` points inside `region`, clear of `blocked` rects and of each other. */
function place(rng: Rng, count: number, region: Rect, blocked: Rect[], taken: Taken[], radius: number, gap: number): Point[] {
	const out: Point[] = [];
	if (region.w <= 0 || region.h <= 0) return out;
	for (let n = 0; n < count; n++) {
		for (let attempt = 0; attempt < 200; attempt++) {
			const x = region.x + rng() * region.w;
			const y = region.y + rng() * region.h;
			if (blocked.some((b) => distToRect(x, y, b) < radius)) continue;
			if (taken.some((t) => Math.hypot(t.x - x, t.y - y) < t.r + radius + gap)) continue;
			out.push([x, y]);
			taken.push({ x, y, r: radius });
			break;
		}
	}
	return out;
}

function chipSize(rng: Rng): number {
	return 20 + Math.floor(rng() * 27);
}

export function buildLayout(input: LayoutInput): BoardLayout {
	const { width: W, height: H, parts, avoid, quiet, mounts } = input;
	const rng = mulberry32(input.seed);
	const jitter = () => (rng() - 0.5) * 0.06;

	const left: Rect | null = quiet ? { x: 0, y: 0, w: quiet.x, h: H } : null;
	const right: Rect | null = quiet ? { x: quiet.x + quiet.w, y: 0, w: W - (quiet.x + quiet.w), h: H } : null;
	const margins = [left, right].filter((m): m is Rect => !!m && m.w >= MIN_MARGIN);

	const buses: BusSpec[] =
		input.mode === 'hero'
			? [
					{ horizontal: true, at: 0.12 + jitter(), count: 5 },
					{ horizontal: true, at: 0.58 + jitter(), count: 4 },
					{ horizontal: true, at: 0.8 + jitter(), count: 6 },
					{ horizontal: false, at: 0.78 + jitter(), count: 4 },
					{ horizontal: false, at: 0.46 + jitter(), count: 3 },
				]
			: [
					...margins.map((m, i) => ({ horizontal: false, at: (m.x + m.w / 2) / W, count: 3 + i })),
					{ horizontal: true, at: 0.16 + jitter(), count: 3 },
					{ horizontal: true, at: 0.4 + jitter(), count: 5 },
					{ horizontal: true, at: 0.9 + jitter(), count: 4 },
				];

	const traces = buses.flatMap((b) => busTraces(rng, W, H, b));
	for (const m of mounts) traces.push(...mountTraces(m, W));

	const mountKeepOut = (r: Rect): Rect => ({
		x: r.x - MOUNT_PAD - MOUNT_FANOUT,
		y: r.y - MOUNT_CLEAR,
		w: r.w + 2 * (MOUNT_PAD + MOUNT_FANOUT),
		h: r.h + 2 * MOUNT_CLEAR,
	});
	const blocked: Rect[] = [...avoid, ...(quiet ? [quiet] : []), ...mounts.map((m) => mountKeepOut(m.rect))];
	const taken: Taken[] = [];

	let nodePoints: Point[];
	if (input.mode === 'hero') {
		const region = { x: W * 0.05, y: H * 0.1, w: W * 0.9, h: H * 0.8 };
		nodePoints = place(rng, 4, region, blocked, taken, NODE_CLEAR, W * 0.1);
	} else {
		nodePoints = margins.flatMap((m) => {
			const region = { x: m.x + NODE_CLEAR, y: H * 0.12, w: m.w - 2 * NODE_CLEAR - 40, h: H * 0.76 };
			return place(rng, 2, region, blocked, taken, NODE_CLEAR, H * 0.2);
		});
	}
	const nodes: AntennaNode[] = nodePoints.map(([x, y], i) => ({ id: `ANT${i + 1}`, x, y }));

	const chips: Chip[] = [];
	const chipRegions = input.mode === 'hero' ? [{ x: W * 0.05, y: H * 0.1, w: W * 0.9, h: H * 0.8 }] : margins;
	const chipCount = Math.min(parts.length, input.mode === 'hero' ? 3 : chipRegions.length);
	for (let i = 0; i < chipCount; i++) {
		const size = chipSize(rng);
		const region = chipRegions[i % chipRegions.length];
		const [p] = place(rng, 1, region, blocked, taken, size / 2 + 22, 12);
		if (p) chips.push({ x: p[0], y: p[1], size, ref: `U${chips.length + 1}`, part: parts[i] });
	}

	const dims: DimZone[] =
		input.mode === 'hero'
			? avoid.map((rect) => ({ rect, alpha: 0.55, feather: 40 }))
			: quiet
				? [{ rect: { x: quiet.x + 10, y: 0, w: quiet.w - 20, h: H }, alpha: 0.96, feather: 22 }]
				: [];

	return { width: W, height: H, traces, chips, nodes, mounts, dims };
}
