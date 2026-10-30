import type { Point, Rect } from './types';

/** The subset of Storage we use, so tests can pass a fake. */
export interface StorageLike {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

/** A link click on the previous page: where it pointed and where it was (viewport px). */
export interface Arrival {
	href: string;
	x: number;
	y: number;
	t: number;
}

export const ARRIVAL_KEY = 'ripple:arrival';
export const ARRIVAL_TTL_MS = 5000;

export function recordArrival(store: StorageLike | null, arrival: Arrival): void {
	try {
		store?.setItem(ARRIVAL_KEY, JSON.stringify(arrival));
	} catch {
		// storage full or blocked: no arrival ping, nothing else breaks
	}
}

/** Read and clear the stored arrival. Null if missing, stale, from the future, or malformed. */
export function takeArrival(store: StorageLike | null, now: number): Arrival | null {
	if (!store) return null;
	let raw: string | null;
	try {
		raw = store.getItem(ARRIVAL_KEY);
		store.removeItem(ARRIVAL_KEY);
	} catch {
		return null;
	}
	if (!raw) return null;
	let a: Partial<Arrival>;
	try {
		a = JSON.parse(raw);
	} catch {
		return null;
	}
	if (typeof a?.href !== 'string' || typeof a.x !== 'number' || typeof a.y !== 'number' || typeof a.t !== 'number') return null;
	if (a.t > now || now - a.t > ARRIVAL_TTL_MS) return null;
	return { href: a.href, x: a.x, y: a.y, t: a.t };
}

const normalizePath = (p: string) => p.replace(/\/+$/, '') || '/';

/**
 * Where the arrival ping comes from, in viewport px: the centre of the first
 * link on this page that points here (usually the active nav link), else the
 * point that was clicked on the previous page.
 */
export function arrivalOrigin(arrival: Arrival, currentPath: string, links: { href: string; rect: Rect }[]): Point {
	const here = normalizePath(currentPath);
	const match = links.find((l) => normalizePath(l.href) === here);
	return match ? [match.rect.x + match.rect.w / 2, match.rect.y + match.rect.h / 2] : [arrival.x, arrival.y];
}
