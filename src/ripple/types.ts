/** Axis-aligned rectangle in CSS px. Board-local unless a comment says otherwise. */
export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

export type Point = [number, number];

export interface Trace {
	points: Point[];
	alpha: number;
	/** Draw a via at the last point: the trace stops short instead of running off the board. */
	via: boolean;
}

export interface Chip {
	/** Centre. */
	x: number;
	y: number;
	size: number;
	ref: string;
	part: string;
}

export interface AntennaNode {
	id: string;
	x: number;
	y: number;
}

/** A photo (or any element) soldered onto the board as a component. */
export interface Mount {
	rect: Rect;
	ref: string;
	label: string;
}

/** Region where the board is painted over with navy so text on top stays readable. */
export interface DimZone {
	rect: Rect;
	alpha: number;
	feather: number;
}

export interface BoardLayout {
	width: number;
	height: number;
	traces: Trace[];
	chips: Chip[];
	nodes: AntennaNode[];
	mounts: Mount[];
	dims: DimZone[];
}
