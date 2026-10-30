import { BoardController } from './controller';
import { wireInteractions } from './interactions';

const RESIZE_DEBOUNCE_MS = 120;
let booted = false;

/** Start every `canvas[data-ripple-board]` on the page. Safe to call more than once. */
export function bootRipples(): void {
	if (booted) return;
	booted = true;
	const canvases = [...document.querySelectorAll<HTMLCanvasElement>('canvas[data-ripple-board]')];
	if (!canvases.length) return;

	const boards = canvases.map((c) => new BoardController(c));
	for (const b of boards) b.setup();

	// hero boards only run while they're on screen; page boards are fixed to the viewport
	const io = new IntersectionObserver((entries) => {
		for (const e of entries) {
			const board = boards.find((b) => b.host === e.target);
			if (board) board.visible = e.isIntersecting;
		}
	});
	for (const b of boards) if (b.mode === 'hero') io.observe(b.host);

	let timer = 0;
	window.addEventListener('resize', () => {
		clearTimeout(timer);
		timer = window.setTimeout(() => boards.forEach((b) => b.setup()), RESIZE_DEBOUNCE_MS);
	});

	// web fonts can move the hero text after first paint; re-measure once they land
	const settled = (document.fonts?.ready ?? Promise.resolve()).then(() => boards.forEach((b) => b.setup()));
	wireInteractions(boards, settled);

	const loop = (now: number) => {
		if (!document.hidden) for (const b of boards) b.frame(now);
		requestAnimationFrame(loop);
	};
	requestAnimationFrame(loop);
}
