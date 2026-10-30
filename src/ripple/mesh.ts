/**
 * Meshtastic-style managed flooding, minus the radio. A packet starts at a
 * point; every antenna in range hears it once the wavefront gets there and,
 * if the packet has hops left, rebroadcasts it. Each antenna relays a given
 * packet at most once. Pure logic: no DOM, no GPU.
 */
export interface MeshNode {
	id: string;
	x: number;
	y: number;
}

export interface MeshOptions {
	/** How far an antenna can hear, in CSS px. */
	rangePx: number;
	/** Wavefront speed in CSS px per sim step. */
	pxPerStep: number;
	/** Delay between hearing a packet and rebroadcasting it, in steps. */
	processingSteps: number;
	/** Strength multiplier applied at each hop. */
	relayFalloff: number;
}

export interface Relay {
	nodeId: string;
	x: number;
	y: number;
	/** Hops the rebroadcast still carries. */
	hopsLeft: number;
	strength: number;
}

interface Pending {
	at: number;
	packet: number;
	node: MeshNode;
	/** Hops the packet had left when it reached this node. */
	hops: number;
	strength: number;
}

export class Mesh {
	private nodes: MeshNode[];
	private readonly opts: MeshOptions;
	private pending: Pending[] = [];
	private heard = new Map<number, Set<string>>();
	private nextPacket = 0;
	private now = 0;

	constructor(nodes: MeshNode[], opts: MeshOptions) {
		this.nodes = nodes;
		this.opts = opts;
	}

	/** True while any rebroadcast is still scheduled. */
	get busy(): boolean {
		return this.pending.length > 0;
	}

	/** Replace the antennas (after a resize). Drops anything in flight. */
	setNodes(nodes: MeshNode[]): void {
		this.nodes = nodes;
		this.pending = [];
		this.heard.clear();
	}

	/** Send a packet from a point. Pass `fromNodeId` when an antenna itself transmits. */
	transmit(origin: { x: number; y: number }, hops: number, strength: number, fromNodeId?: string): void {
		const packet = this.nextPacket++;
		this.heard.set(packet, new Set(fromNodeId ? [fromNodeId] : []));
		this.schedule(packet, origin, hops, strength);
		if (!this.pending.some((p) => p.packet === packet)) this.heard.delete(packet);
	}

	/** Advance the clock to `step` and return the rebroadcasts due by then, oldest first. */
	tick(step: number): Relay[] {
		this.now = step;
		const due = this.pending.filter((p) => p.at <= step).sort((a, b) => a.at - b.at);
		if (!due.length) return [];
		this.pending = this.pending.filter((p) => p.at > step);
		const relays: Relay[] = [];
		for (const p of due) {
			const heard = this.heard.get(p.packet);
			if (!heard || heard.has(p.node.id)) continue;
			heard.add(p.node.id);
			if (p.hops <= 0) continue;
			relays.push({ nodeId: p.node.id, x: p.node.x, y: p.node.y, hopsLeft: p.hops - 1, strength: p.strength });
			this.schedule(p.packet, p.node, p.hops - 1, p.strength);
		}
		const live = new Set(this.pending.map((p) => p.packet));
		for (const packet of this.heard.keys()) if (!live.has(packet)) this.heard.delete(packet);
		return relays;
	}

	private schedule(packet: number, from: { x: number; y: number }, hops: number, strength: number): void {
		const heard = this.heard.get(packet);
		if (!heard) return;
		for (const node of this.nodes) {
			if (heard.has(node.id)) continue;
			const d = Math.hypot(node.x - from.x, node.y - from.y);
			if (d > this.opts.rangePx) continue;
			this.pending.push({
				at: this.now + d / this.opts.pxPerStep + this.opts.processingSteps,
				packet,
				node,
				hops,
				strength: strength * this.opts.relayFalloff,
			});
		}
	}
}
