import { MOUNT_PAD, MOUNT_PIN_PITCH, MOUNT_PINS } from './layout';
import type { AntennaNode, BoardLayout, Chip, DimZone, Mount, Trace } from './types';

const BOARD_DARK = 'rgb(0,40,56)';
const COPPER = 'rgba(199,120,66,0.9)';
const COPPER_PAD = 'rgba(224,160,106,0.9)';
const SILK = 'rgba(234,242,250,0.38)';
const SILK_LINE = 'rgba(234,242,250,0.3)';
const DIM_RGB = '0,52,72';
const DIM_LAYERS = 12;

/** Per-layer alpha so that `layers` stacked fills reach `alpha` in the middle of a dim zone. */
export function layerAlpha(alpha: number, layers: number): number {
	return 1 - Math.pow(1 - alpha, 1 / layers);
}

/** Paint a layout onto `canvas` at `dpr` device px per CSS px. Sizes the canvas to fit. */
export function paintBoard(canvas: HTMLCanvasElement, layout: BoardLayout, dpr: number): void {
	const W = layout.width;
	const H = layout.height;
	canvas.width = Math.max(1, Math.round(W * dpr));
	canvas.height = Math.max(1, Math.round(H * dpr));
	const ctx = canvas.getContext('2d');
	if (!ctx) return;
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

	const g = ctx.createLinearGradient(0, 0, 0, H);
	g.addColorStop(0, 'rgb(0,58,80)');
	g.addColorStop(1, 'rgb(0,44,63)');
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, W, H);

	// schematic-paper dot grid, same 24px pitch as the site's .dot-grid
	ctx.fillStyle = 'rgba(255,255,255,0.075)';
	for (let y = 12; y < H; y += 24) for (let x = 12; x < W; x += 24) ctx.fillRect(x - 0.6, y - 0.6, 1.2, 1.2);

	ctx.lineJoin = 'miter';
	ctx.lineCap = 'round';
	ctx.lineWidth = 2;
	for (const t of layout.traces) drawTrace(ctx, t);
	ctx.font = '10px ui-monospace, monospace';
	for (const c of layout.chips) drawChip(ctx, c);
	for (const m of layout.mounts) drawMount(ctx, m);
	for (const n of layout.nodes) drawNode(ctx, n);
	for (const z of layout.dims) drawDim(ctx, z);
}

function via(ctx: CanvasRenderingContext2D, x: number, y: number): void {
	ctx.fillStyle = COPPER;
	ctx.beginPath();
	ctx.arc(x, y, 3.6, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = 'rgb(0,34,48)';
	ctx.beginPath();
	ctx.arc(x, y, 1.4, 0, Math.PI * 2);
	ctx.fill();
}

function drawTrace(ctx: CanvasRenderingContext2D, t: Trace): void {
	ctx.strokeStyle = `rgba(199,120,66,${t.alpha})`;
	ctx.beginPath();
	t.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
	ctx.stroke();
	if (t.via) {
		const [x, y] = t.points[t.points.length - 1];
		via(ctx, x, y);
	}
}

function drawChip(ctx: CanvasRenderingContext2D, c: Chip): void {
	const s = c.size;
	const x0 = c.x - s / 2;
	const y0 = c.y - s / 2;
	ctx.fillStyle = BOARD_DARK;
	ctx.fillRect(x0 - 10, y0 - 10, s + 20, s + 20);
	ctx.strokeStyle = SILK_LINE;
	ctx.lineWidth = 1;
	ctx.strokeRect(x0, y0, s, s);
	ctx.lineWidth = 2;
	ctx.fillStyle = SILK_LINE;
	ctx.beginPath();
	ctx.arc(x0 + 5, y0 + 5, 1.6, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = COPPER_PAD;
	const pins = Math.max(3, Math.floor(s / 7));
	for (let i = 0; i < pins; i++) {
		const t = -s / 2 + (i + 0.5) * (s / pins);
		ctx.fillRect(c.x + t - 1.4, y0 - 7, 2.8, 5);
		ctx.fillRect(c.x + t - 1.4, y0 + s + 2, 2.8, 5);
		ctx.fillRect(x0 - 7, c.y + t - 1.4, 5, 2.8);
		ctx.fillRect(x0 + s + 2, c.y + t - 1.4, 5, 2.8);
	}
	ctx.fillStyle = SILK;
	ctx.fillText(c.ref, x0, y0 - 13);
	ctx.fillText(c.part, x0, y0 + s + 21);
}

/** The footprint around a mounted photo. The photo itself is HTML on top of the canvas. */
function drawMount(ctx: CanvasRenderingContext2D, m: Mount): void {
	const r = m.rect;
	const ox = r.x - MOUNT_PAD;
	const oy = r.y - MOUNT_PAD;
	const ow = r.w + 2 * MOUNT_PAD;
	const oh = r.h + 2 * MOUNT_PAD;
	ctx.fillStyle = BOARD_DARK;
	ctx.fillRect(ox, oy, ow, oh);
	ctx.strokeStyle = SILK_LINE;
	ctx.lineWidth = 1;
	ctx.strokeRect(ox, oy, ow, oh);
	ctx.lineWidth = 2;
	ctx.fillStyle = SILK_LINE;
	ctx.beginPath();
	ctx.arc(ox + 7, oy + 7, 2, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = SILK;
	ctx.fillText(m.ref, ox, oy - 8);
	ctx.fillText(m.label, ox, oy + oh + 14);
	ctx.fillStyle = COPPER_PAD;
	const cy = r.y + r.h / 2;
	for (let i = 0; i < MOUNT_PINS; i++) {
		const py = cy + (i - (MOUNT_PINS - 1) / 2) * MOUNT_PIN_PITCH;
		ctx.fillRect(ox - 10, py - 2.5, 8, 5);
		ctx.fillRect(ox + ow + 2, py - 2.5, 8, 5);
	}
}

function drawNode(ctx: CanvasRenderingContext2D, n: AntennaNode): void {
	ctx.fillStyle = BOARD_DARK;
	ctx.beginPath();
	ctx.arc(n.x, n.y, 22, 0, Math.PI * 2);
	ctx.fill();
	ctx.setLineDash([3, 4]);
	ctx.strokeStyle = 'rgba(234,242,250,0.22)';
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.arc(n.x, n.y, 21, 0, Math.PI * 2);
	ctx.stroke();
	ctx.setLineDash([]);
	ctx.strokeStyle = 'rgba(199,120,66,0.85)';
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.arc(n.x, n.y, 12, 0, Math.PI * 2);
	ctx.stroke();
	ctx.fillStyle = 'rgba(224,160,106,0.95)';
	ctx.beginPath();
	ctx.arc(n.x, n.y, 6.5, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = SILK;
	ctx.fillText(n.id, n.x + 27, n.y + 4);
}

/**
 * Feathered navy wash, built from stacked fills that each shrink a little, so
 * the edge ramps over `feather` px. Deliberately avoids `ctx.filter`, which
 * Safari can't be relied on to support.
 */
function drawDim(ctx: CanvasRenderingContext2D, z: DimZone): void {
	ctx.fillStyle = `rgba(${DIM_RGB},${layerAlpha(z.alpha, DIM_LAYERS)})`;
	for (let i = 0; i < DIM_LAYERS; i++) {
		const inset = -z.feather / 2 + (z.feather * i) / DIM_LAYERS;
		const w = z.rect.w - 2 * inset;
		const h = z.rect.h - 2 * inset;
		if (w > 0 && h > 0) ctx.fillRect(z.rect.x + inset, z.rect.y + inset, w, h);
	}
}
