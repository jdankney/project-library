import { describe, expect, it } from 'vitest';
import { ARRIVAL_KEY, arrivalOrigin, recordArrival, takeArrival, type StorageLike } from './arrival';

function memoryStore(): StorageLike & { data: Map<string, string> } {
	const data = new Map<string, string>();
	return {
		data,
		getItem: (k) => data.get(k) ?? null,
		setItem: (k, v) => void data.set(k, v),
		removeItem: (k) => void data.delete(k),
	};
}

const throwingStore: StorageLike = {
	getItem() {
		throw new Error('SecurityError');
	},
	setItem() {
		throw new Error('QuotaExceededError');
	},
	removeItem() {
		throw new Error('SecurityError');
	},
};

const click = { href: '/projects/', x: 640, y: 30, t: 1_000 };

describe('arrival storage', () => {
	it('round-trips a fresh click', () => {
		const store = memoryStore();
		recordArrival(store, click);
		expect(takeArrival(store, 1_500)).toEqual(click);
	});

	it('can only be read once', () => {
		const store = memoryStore();
		recordArrival(store, click);
		takeArrival(store, 1_500);
		expect(takeArrival(store, 1_600)).toBeNull();
		expect(store.data.has(ARRIVAL_KEY)).toBe(false);
	});

	it('expires after 5 seconds', () => {
		const store = memoryStore();
		recordArrival(store, click);
		expect(takeArrival(store, 1_000 + 5_001)).toBeNull();
	});

	it('rejects timestamps from the future', () => {
		const store = memoryStore();
		recordArrival(store, click);
		expect(takeArrival(store, 999)).toBeNull();
	});

	it('rejects malformed entries', () => {
		const store = memoryStore();
		store.setItem(ARRIVAL_KEY, '{not json');
		expect(takeArrival(store, 1_500)).toBeNull();
		store.setItem(ARRIVAL_KEY, JSON.stringify({ href: '/', x: 'left', y: 0, t: 1_000 }));
		expect(takeArrival(store, 1_500)).toBeNull();
	});

	it('survives storage that throws or is missing', () => {
		expect(() => recordArrival(throwingStore, click)).not.toThrow();
		expect(takeArrival(throwingStore, 1_500)).toBeNull();
		expect(() => recordArrival(null, click)).not.toThrow();
		expect(takeArrival(null, 1_500)).toBeNull();
	});
});

describe('arrivalOrigin', () => {
	const links = [
		{ href: '/', rect: { x: 600, y: 10, w: 50, h: 40 } },
		{ href: '/projects', rect: { x: 660, y: 10, w: 80, h: 40 } },
	];

	it('pings from the link that points at the current page, ignoring trailing slashes', () => {
		expect(arrivalOrigin(click, '/projects/', links)).toEqual([700, 30]);
	});

	it('falls back to the clicked point when nothing on the page links here', () => {
		expect(arrivalOrigin(click, '/projects/pihole-mdns/', links)).toEqual([640, 30]);
	});
});
