import { arrivalOrigin, recordArrival, takeArrival, type StorageLike } from './arrival';
import type { BoardController } from './controller';

/** Things a click is meant for. Clicks on these never transmit from a page board. */
const INTERACTIVE = 'a[href], button, input, select, textarea, label, summary, [data-ping]';
/** Things that ping when hovered or focused. */
const PING_TARGET = 'a[href], [data-ping]';
const HOVER_STRENGTH = 0.32;

function session(): StorageLike | null {
	try {
		return window.sessionStorage;
	} catch {
		return null; // storage disabled: no arrival pings
	}
}

/**
 * Document-level wiring for every board on the page: hover/focus pings,
 * click-to-transmit, hero cursor wake, and the arrival ping from the link
 * that brought the visitor here. `settled` resolves once the boards have been
 * measured against final layout (after web fonts load).
 */
export function wireInteractions(boards: BoardController[], settled: Promise<void>): void {
	const heroes = boards.filter((b) => b.mode === 'hero');
	const page = boards.find((b) => b.mode === 'page');
	const boardFor = (el: Element) => heroes.find((h) => h.host.contains(el)) ?? page;

	const pingFrom = (el: Element) => {
		const board = boardFor(el);
		if (!board) return;
		const r = el.getBoundingClientRect();
		const [x, y] = board.toLocal(r.left + r.width / 2, r.top + r.height / 2);
		board.ping(x, y, HOVER_STRENGTH);
	};

	// one ping per element entered, not one per child element crossed
	let lastHover: Element | null = null;
	document.addEventListener('pointerover', (e) => {
		const el = e.target instanceof Element ? e.target.closest(PING_TARGET) : null;
		if (el && el !== lastHover) pingFrom(el);
		lastHover = el;
	});
	document.addEventListener('focusin', (e) => {
		const el = e.target instanceof Element ? e.target.closest(PING_TARGET) : null;
		if (el) pingFrom(el);
	});

	document.addEventListener('pointerdown', (e) => {
		if (!(e.target instanceof Element)) return;
		const hero = heroes.find((h) => h.host.contains(e.target as Element));
		if (hero) {
			const [x, y] = hero.toLocal(e.clientX, e.clientY);
			hero.transmit(x, y, 3, 1);
			return;
		}
		if (!page || e.target.closest(INTERACTIVE)) return;
		page.transmit(e.clientX, e.clientY, 2, 0.9);
	});

	for (const hero of heroes) {
		let last: [number, number] | null = null;
		hero.host.addEventListener('pointermove', (e) => {
			if (e.pointerType !== 'mouse') return;
			const [x, y] = hero.toLocal(e.clientX, e.clientY);
			if (last) {
				const speed = Math.hypot(x - last[0], y - last[1]);
				if (speed > 1.5) hero.stir(x, y, Math.min(0.03 + speed * 0.006, 0.2));
			}
			last = [x, y];
		});
		hero.host.addEventListener('pointerleave', () => {
			last = null;
		});
	}

	// remember same-site link clicks so the next page can ping from where the visitor came in
	document.addEventListener('click', (e) => {
		const a = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>('a[href]') : null;
		if (!a || a.origin !== location.origin) return;
		const r = a.getBoundingClientRect();
		const keyboard = e.detail === 0; // Enter on a focused link reports no pointer position
		recordArrival(session(), {
			href: a.pathname,
			x: keyboard ? r.left + r.width / 2 : e.clientX,
			y: keyboard ? r.top + r.height / 2 : e.clientY,
			t: Date.now(),
		});
	});

	void settled.then(() => {
		const arrival = takeArrival(session(), Date.now());
		const board = heroes[0] ?? page;
		if (!arrival || !board) return;
		const links = [...document.querySelectorAll<HTMLAnchorElement>('a[href]')]
			.filter((a) => a.origin === location.origin)
			.map((a) => {
				const r = a.getBoundingClientRect();
				return { href: a.pathname, rect: { x: r.left, y: r.top, w: r.width, h: r.height } };
			});
		const [vx, vy] = arrivalOrigin(arrival, location.pathname, links);
		const [x, y] = board.toLocal(vx, vy);
		board.transmit(x, y, 2, 0.7);
		board.canvas.dataset.rippleArrivals = String(Number(board.canvas.dataset.rippleArrivals ?? 0) + 1);
	});
}
