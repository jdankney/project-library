import vertSource from './shaders/fullscreen.vert?raw';
import dropSource from './shaders/drop.frag?raw';
import updateSource from './shaders/update.frag?raw';
import renderSource from './shaders/render.frag?raw';
import type { Rect } from './types';

/** Wavefront speed of the update rule, in sim texels per step. */
export const WAVE_SPEED = 0.707;
/** Matches the u_nodes array length in render.frag. */
export const MAX_NODES = 8;
/** Pings queued past this in one frame are dropped (a fast hover sweep can't flood the GPU). */
const MAX_DROPS_PER_STEP = 16;

export interface Look {
	refract: number;
	normal: number;
	caustic: number;
	spec: number;
	tint: number;
}

export interface FieldOptions {
	simWidth: number;
	damping: number;
	quietDamping: number;
	look: Look;
}

export interface FieldNode {
	x: number;
	y: number;
	flash: number;
}

export interface Field {
	readonly simWidth: number;
	/** Largest texture side the GPU accepts, in device px. */
	readonly maxTextureSize: number;
	readonly simHeight: number;
	/** Size the field to its board (CSS px) and upload the painted board as the texture under the water. */
	resize(cssW: number, cssH: number, dpr: number, board: HTMLCanvasElement): void;
	/** Queue a ping at board-local CSS px. Applied on the next step(). */
	ping(x: number, y: number, strength: number, radius: number): void;
	setQuietZone(rect: Rect | null): void;
	setNodes(nodes: FieldNode[]): void;
	step(steps: number): void;
	render(): void;
	destroy(): void;
}

type Uniforms = Record<string, WebGLUniformLocation | null>;
interface Program {
	program: WebGLProgram;
	uniforms: Uniforms;
}
interface Target {
	texture: WebGLTexture;
	framebuffer: WebGLFramebuffer;
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
	const shader = gl.createShader(type);
	if (!shader) throw new Error('createShader failed');
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'compile failed');
	return shader;
}

function link(gl: WebGL2RenderingContext, fragSource: string): Program {
	const program = gl.createProgram();
	if (!program) throw new Error('createProgram failed');
	const vert = compile(gl, gl.VERTEX_SHADER, vertSource);
	const frag = compile(gl, gl.FRAGMENT_SHADER, fragSource);
	gl.attachShader(program, vert);
	gl.attachShader(program, frag);
	gl.linkProgram(program);
	// the linked program keeps what it needs; the shader objects would otherwise leak on every rebuild
	gl.deleteShader(vert);
	gl.deleteShader(frag);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'link failed');
	const uniforms: Uniforms = {};
	const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
	for (let i = 0; i < count; i++) {
		const info = gl.getActiveUniform(program, i);
		if (info) uniforms[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(program, info.name);
	}
	return { program, uniforms };
}

/** A half-float RGBA texture we can render into, or null if this GPU can't. */
function makeTarget(gl: WebGL2RenderingContext, w: number, h: number): Target | null {
	const texture = gl.createTexture();
	const framebuffer = gl.createFramebuffer();
	if (!texture || !framebuffer) return null;
	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
	setSampling(gl);
	gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
	const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	if (!ok) {
		gl.deleteTexture(texture);
		gl.deleteFramebuffer(framebuffer);
		return null;
	}
	return { texture, framebuffer };
}

function setSampling(gl: WebGL2RenderingContext): void {
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

/**
 * Build a wave field on `canvas`. Returns null when the browser can't run it
 * (no WebGL2, no float render targets, shaders won't build); callers then
 * show the static board instead.
 */
export function createField(canvas: HTMLCanvasElement, opts: FieldOptions): Field | null {
	const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false });
	if (!gl) return null;
	if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) return null;
	const probe = makeTarget(gl, 4, 4);
	if (!probe) return null;
	gl.deleteTexture(probe.texture);
	gl.deleteFramebuffer(probe.framebuffer);
	try {
		return new GLField(gl, canvas, opts, {
			drop: link(gl, dropSource),
			update: link(gl, updateSource),
			render: link(gl, renderSource),
		});
	} catch (err) {
		console.warn('[ripple] falling back to the static board:', err);
		return null;
	}
}

class GLField implements Field {
	simWidth = 0;
	simHeight = 0;
	readonly maxTextureSize: number;
	private cssW = 1;
	private cssH = 1;
	private targets: [Target, Target] | null = null;
	private readonly boardTexture: WebGLTexture | null;
	private readonly vao: WebGLVertexArrayObject | null;
	private readonly buffer: WebGLBuffer | null;
	private drops: { u: number; v: number; strength: number; radius: number }[] = [];
	private quiet: [number, number, number, number] | null = null;
	private readonly nodes = new Float32Array(MAX_NODES * 3);
	private nodeCount = 0;
	private readonly gl: WebGL2RenderingContext;
	private readonly canvas: HTMLCanvasElement;
	private readonly opts: FieldOptions;
	private readonly programs: { drop: Program; update: Program; render: Program };

	constructor(
		gl: WebGL2RenderingContext,
		canvas: HTMLCanvasElement,
		opts: FieldOptions,
		programs: { drop: Program; update: Program; render: Program },
	) {
		this.gl = gl;
		this.canvas = canvas;
		this.opts = opts;
		this.programs = programs;
		this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
		this.vao = gl.createVertexArray();
		gl.bindVertexArray(this.vao);
		this.buffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
		this.boardTexture = gl.createTexture();
	}

	resize(cssW: number, cssH: number, dpr: number, board: HTMLCanvasElement): void {
		const gl = this.gl;
		this.cssW = Math.max(1, cssW);
		this.cssH = Math.max(1, cssH);
		this.canvas.width = Math.max(1, Math.round(this.cssW * dpr));
		this.canvas.height = Math.max(1, Math.round(this.cssH * dpr));
		this.simWidth = this.opts.simWidth;
		this.simHeight = Math.max(8, Math.round((this.opts.simWidth * this.cssH) / this.cssW));
		this.freeTargets();
		const a = makeTarget(gl, this.simWidth, this.simHeight);
		const b = makeTarget(gl, this.simWidth, this.simHeight);
		if (!a || !b) throw new Error('float render target unavailable');
		this.targets = [a, b];
		gl.bindTexture(gl.TEXTURE_2D, this.boardTexture);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, board);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
		setSampling(gl);
		this.drops = [];
	}

	ping(x: number, y: number, strength: number, radius: number): void {
		if (this.drops.length >= MAX_DROPS_PER_STEP) return;
		this.drops.push({ u: x / this.cssW, v: 1 - y / this.cssH, strength, radius });
	}

	setQuietZone(r: Rect | null): void {
		this.quiet = r ? [r.x / this.cssW, 1 - (r.y + r.h) / this.cssH, (r.x + r.w) / this.cssW, 1 - r.y / this.cssH] : null;
	}

	setNodes(nodes: FieldNode[]): void {
		this.nodes.fill(0);
		this.nodeCount = Math.min(MAX_NODES, nodes.length);
		for (let i = 0; i < this.nodeCount; i++) {
			const n = nodes[i];
			this.nodes.set([n.x / this.cssW, 1 - n.y / this.cssH, n.flash], i * 3);
		}
	}

	step(steps: number): void {
		if (!this.targets) return;
		const gl = this.gl;
		gl.bindVertexArray(this.vao);
		for (const d of this.drops) {
			this.pass(this.programs.drop, (u) => {
				gl.uniform2f(u.u_center, d.u, d.v);
				gl.uniform1f(u.u_radius, d.radius);
				gl.uniform1f(u.u_strength, d.strength);
			});
		}
		this.drops = [];
		const q = this.quiet ?? [0, 0, 0, 0];
		for (let i = 0; i < steps; i++) {
			this.pass(this.programs.update, (u) => {
				gl.uniform1f(u.u_damping, this.opts.damping);
				gl.uniform1f(u.u_quietDamping, this.opts.quietDamping);
				gl.uniform1f(u.u_quietOn, this.quiet ? 1 : 0);
				gl.uniform4f(u.u_quiet, q[0], q[1], q[2], q[3]);
			});
		}
	}

	render(): void {
		if (!this.targets) return;
		const gl = this.gl;
		const u = this.programs.render.uniforms;
		const look = this.opts.look;
		const q = this.quiet ?? [0, 0, 0, 0];
		gl.bindVertexArray(this.vao);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
		gl.useProgram(this.programs.render.program);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.targets[0].texture);
		gl.uniform1i(u.u_state, 0);
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, this.boardTexture);
		gl.uniform1i(u.u_board, 1);
		gl.uniform2f(u.u_texel, 1 / this.simWidth, 1 / this.simHeight);
		gl.uniform1f(u.u_refract, look.refract);
		gl.uniform1f(u.u_normal, look.normal);
		gl.uniform1f(u.u_caustic, look.caustic);
		gl.uniform1f(u.u_spec, look.spec);
		gl.uniform1f(u.u_tint, look.tint);
		gl.uniform1f(u.u_quietOn, this.quiet ? 1 : 0);
		gl.uniform4f(u.u_quiet, q[0], q[1], q[2], q[3]);
		gl.uniform3fv(u.u_nodes, this.nodes);
		gl.uniform1i(u.u_nodeCount, this.nodeCount);
		gl.uniform1f(u.u_aspect, this.cssW / this.cssH);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
	}

	destroy(): void {
		const gl = this.gl;
		this.freeTargets();
		gl.deleteTexture(this.boardTexture);
		gl.deleteBuffer(this.buffer);
		gl.deleteVertexArray(this.vao);
		for (const p of Object.values(this.programs)) gl.deleteProgram(p.program);
	}

	/** Run one fullscreen pass reading the current state and writing the other target, then swap. */
	private pass(p: Program, setUniforms: (u: Uniforms) => void): void {
		const gl = this.gl;
		const [src, dst] = this.targets as [Target, Target];
		gl.useProgram(p.program);
		gl.bindFramebuffer(gl.FRAMEBUFFER, dst.framebuffer);
		gl.viewport(0, 0, this.simWidth, this.simHeight);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, src.texture);
		gl.uniform1i(p.uniforms.u_state, 0);
		gl.uniform2f(p.uniforms.u_texel, 1 / this.simWidth, 1 / this.simHeight);
		setUniforms(p.uniforms);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		this.targets = [dst, src];
	}

	private freeTargets(): void {
		for (const t of this.targets ?? []) {
			this.gl.deleteTexture(t.texture);
			this.gl.deleteFramebuffer(t.framebuffer);
		}
		this.targets = null;
	}
}
