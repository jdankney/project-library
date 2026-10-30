import { paintBoard } from './board';
import { buildLayout, parseParts } from './layout';
import { Mesh } from './mesh';
import { hashString } from './rng';
import { createField, WAVE_SPEED, type Field, type Look } from './sim';
import type { BoardLayout, Mount, Rect } from './types';

export type BoardMode = 'hero' | 'page';
export type BoardState = 'live' | 'static' | 'off';

/** Page boards need side margins to show in; below this viewport width they stay off. */
export const PAGE_MIN_WIDTH = 1100;
/** Below this width the hero stacks and its sim runs at lower resolution. */
const NARROW = 900;
const STEPS_PER_FRAME = 2;
/** ~7.5 s at 60 fps with no new pings and nothing in flight, then the sim stops. */
const SLEEP_AFTER_STEPS = 900;
const LOOK: Look = { refract: 0.012, normal: 2.6, caustic: 7.0, spec: 1.1, tint: 0.2 };

interface Measured {
	width: number;
	height: number;
	avoid: Rect[];
	quiet: Rect | null;
	mounts: Mount[];
}

const dpr = () => Math.min(window.devicePixelRatio || 1, 2);

/** Runs one ripple board: measuring, layout, the live sim or its static stand-in, mesh relays, sleep. */
export class BoardController {
	readonly mode: BoardMode;
	/** Hero: the section the board fills. Page: the body (the board is fixed to the viewport). */
	readonly host: HTMLElement;
	canvas: HTMLCanvasElement;
	state: BoardState = 'off';
	/** Cleared by the IntersectionObserver while a hero is scrolled out of view. */
	visible = true;

	private readonly seed: number;
	private readonly parts: string[];
	private field: Field | null = null;
	private mesh: Mesh | null = null;
	private layout: BoardLayout | null = null;
	private geometryKey = '';
	private hasGL = false;
	private flashes = new Map<string, number>();
	private stepCount = 0;
	private lastDropStep = 0;
	private awake = false;
	private wake: { x: number; y: number; s: number } | null = null;
	private nextAuto = 0;

	constructor(canvas: HTMLCanvasElement) {
		this.canvas = canvas;
		this.mode = canvas.dataset.mode === 'hero' ? 'hero' : 'page';
		this.host = this.mode === 'hero' && canvas.parentElement ? canvas.parentElement : document.body;
		this.seed = hashString(canvas.dataset.seed ?? location.pathname);
		this.parts = parseParts(canvas.dataset.parts);
	}

	/** Measure the page and (re)build the board. Cheap no-op when nothing moved since last time. */
	setup(): void {
		if (this.mode === 'page' && window.innerWidth < PAGE_MIN_WIDTH) {
			this.teardownField();
			this.geometryKey = '';
			this.setState('off');
			return;
		}
		const geometry = this.measure();
		const key = JSON.stringify([geometry, window.innerWidth < NARROW, dpr()]);
		if (key === this.geometryKey && this.state !== 'off') return;
		this.geometryKey = key;
		this.teardownField();
		this.layout = buildLayout({ ...geometry, mode: this.mode, seed: this.seed, parts: this.parts });
		this.canvas.dataset.rippleGeometry = JSON.stringify({ avoid: geometry.avoid, quiet: geometry.quiet });
		const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (reduced || !this.startLive(geometry)) this.showStatic();
	}

	/** Viewport px to board-local px. */
	toLocal(clientX: number, clientY: number): [number, number] {
		if (this.mode === 'page') return [clientX, clientY];
		const r = this.host.getBoundingClientRect();
		return [clientX - r.left, clientY - r.top];
	}

	/** A soft ping at board-local px. Wakes the sim. */
	ping(x: number, y: number, strength: number, radius = 4): void {
		if (this.state !== 'live' || !this.field) return;
		const [cx, cy] = this.clamp(x, y);
		this.field.ping(cx, cy, strength, radius);
		this.lastDropStep = this.stepCount;
		this.setAwake(true);
	}

	/** A packet: a ping the antennas hear and relay. */
	transmit(x: number, y: number, hops: number, strength: number, fromNodeId?: string): void {
		if (this.state !== 'live' || !this.mesh) return;
		const [cx, cy] = this.clamp(x, y);
		this.ping(cx, cy, strength, 5);
		this.mesh.transmit({ x: cx, y: cy }, hops, strength, fromNodeId);
		if (fromNodeId) this.flashes.set(fromNodeId, 1);
	}

	/** Cursor wake: keeps only the strongest stir per frame. */
	stir(x: number, y: number, strength: number): void {
		if (this.state !== 'live') return;
		if (!this.wake || strength > this.wake.s) this.wake = { x, y, s: strength };
	}

	frame(now: number): void {
		if (this.state !== 'live' || !this.field || !this.mesh || !this.layout || !this.visible) return;
		const nodes = this.layout.nodes;
		if (this.mode === 'hero' && nodes.length && now >= this.nextAuto) {
			const n = nodes[Math.floor(Math.random() * nodes.length)];
			this.transmit(n.x, n.y, 3, 0.8, n.id);
			this.nextAuto = now + 5000 + Math.random() * 3000;
		}
		if (this.wake) {
			this.ping(this.wake.x, this.wake.y, this.wake.s, 3);
			this.wake = null;
		}
		if (!this.awake) return;
		for (let i = 0; i < STEPS_PER_FRAME; i++) {
			this.stepCount++;
			for (const r of this.mesh.tick(this.stepCount)) {
				this.field.ping(r.x, r.y, r.strength, 5);
				this.lastDropStep = this.stepCount;
				this.flashes.set(r.nodeId, 1);
			}
			this.field.step(1);
		}
		let flashing = false;
		for (const [id, f] of this.flashes) {
			const next = f * 0.94;
			this.flashes.set(id, next);
			if (next > 0.01) flashing = true;
		}
		this.syncNodes();
		this.field.render();
		if (this.stepCount - this.lastDropStep > SLEEP_AFTER_STEPS && !this.mesh.busy && !flashing) this.setAwake(false);
	}

	private measure(): Measured {
		if (this.mode === 'page') {
			const width = window.innerWidth;
			const height = window.innerHeight;
			const col = document.querySelector('[data-board-quiet]')?.getBoundingClientRect();
			const quiet = col ? { x: col.left - 28, y: 0, w: col.width + 56, h: height } : null;
			return { width, height, avoid: [], quiet, mounts: [] };
		}
		const hr = this.host.getBoundingClientRect();
		const rel = (el: Element): Rect => {
			const r = el.getBoundingClientRect();
			return { x: r.left - hr.left, y: r.top - hr.top, w: r.width, h: r.height };
		};
		const avoid = [...this.host.querySelectorAll('[data-board-avoid]')].map(rel);
		const mounts = [...this.host.querySelectorAll<HTMLElement>('[data-board-mount]')].map((el) => ({
			rect: rel(el),
			ref: el.dataset.ref ?? 'J1',
			label: el.dataset.label ?? '',
		}));
		return { width: hr.width, height: hr.height, avoid, quiet: null, mounts };
	}

	private startLive(g: Measured): boolean {
		if (!this.layout) return false;
		const simWidth = this.mode === 'hero' ? (window.innerWidth < NARROW ? 200 : 340) : 280;
		const field = createField(this.canvas, {
			simWidth,
			damping: this.mode === 'hero' ? 0.994 : 0.992,
			quietDamping: 0.975,
			look: LOOK,
		});
		if (!field) return false;
		this.hasGL = true;
		if (!this.canvas.dataset.rippleLossHandled) {
			this.canvas.dataset.rippleLossHandled = 'true';
			this.canvas.addEventListener('webglcontextlost', () => this.showStatic());
		}
		const board = document.createElement('canvas');
		paintBoard(board, this.layout, dpr());
		try {
			field.resize(g.width, g.height, dpr(), board);
		} catch {
			field.destroy();
			return false;
		}
		field.setQuietZone(g.quiet);
		this.field = field;
		this.mesh = new Mesh(this.layout.nodes, {
			rangePx: 0.55 * g.width,
			pxPerStep: WAVE_SPEED * (g.width / field.simWidth),
			processingSteps: 14,
			relayFalloff: 0.82,
		});
		this.flashes.clear();
		this.syncNodes();
		field.render();
		this.nextAuto = performance.now() + 1500;
		this.setState('live');
		this.setAwake(false);
		return true;
	}

	/** Paint the board once, no animation. Swaps in a fresh canvas if this one already holds a WebGL context. */
	private showStatic(): void {
		this.teardownField();
		if (this.hasGL) {
			const fresh = this.canvas.cloneNode(false) as HTMLCanvasElement;
			this.canvas.replaceWith(fresh);
			this.canvas = fresh;
			this.hasGL = false;
		}
		if (this.layout) paintBoard(this.canvas, this.layout, dpr());
		this.setState('static');
	}

	private teardownField(): void {
		this.field?.destroy();
		this.field = null;
		this.mesh = null;
		this.wake = null;
		this.setAwake(false);
	}

	private syncNodes(): void {
		if (!this.field || !this.layout) return;
		this.field.setNodes(this.layout.nodes.map((n) => ({ x: n.x, y: n.y, flash: this.flashes.get(n.id) ?? 0 })));
	}

	private clamp(x: number, y: number): [number, number] {
		const w = this.layout?.width ?? 1;
		const h = this.layout?.height ?? 1;
		return [Math.min(Math.max(x, 0), w - 1), Math.min(Math.max(y, 0), h - 1)];
	}

	private setState(state: BoardState): void {
		this.state = state;
		this.canvas.dataset.rippleState = state;
		this.canvas.style.display = state === 'off' ? 'none' : '';
	}

	private setAwake(awake: boolean): void {
		this.awake = awake;
		this.canvas.dataset.rippleAwake = String(awake);
	}
}
