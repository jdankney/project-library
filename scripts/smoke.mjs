// Headless smoke test for the ripple boards, run against the built site.
//   npm run build && npm run smoke
// Uses Playwright's Chromium (`npx playwright install chromium` once), or a
// system Chromium via CHROMIUM_PATH=/usr/bin/chromium. WebGL runs on
// SwiftShader (software), so it's slow: the sleep check alone can take ~1 min.
// Screenshots land in smoke-shots/ for a human to look at.
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const PORT = 4329;
const BASE = `http://localhost:${PORT}`;
const OUT = 'smoke-shots';
const POST = '/projects/esp32s3-solar-meshnode/';
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const GL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const launch = (args) => chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args });

const failures = [];
function check(ok, message) {
	if (!ok) failures.push(message);
	console.log(`${ok ? 'ok  ' : 'FAIL'} ${message}`);
}

const board = (mode) => `canvas[data-ripple-board][data-mode="${mode}"]`;
// no auto-wait: a missing board should report as a FAIL line, not a 30 s timeout crash
const attr = (page, mode, name) =>
	page.evaluate(([sel, n]) => document.querySelector(sel)?.getAttribute(n) ?? null, [board(mode), name]);
const waitForAttr = (page, mode, key, value, timeout) =>
	page
		.waitForFunction(([sel, k, v]) => document.querySelector(sel)?.dataset[k] === v, [board(mode), key, value], { timeout })
		.catch(() => {});

async function open(browser, path, { viewport = DESKTOP, reducedMotion = 'no-preference', allowGLErrors = false } = {}) {
	const context = await browser.newContext({ viewport, reducedMotion });
	const page = await context.newPage();
	const errors = [];
	page.on('console', (m) => {
		if (m.type() === 'error' && !(allowGLErrors && /webgl/i.test(m.text()))) errors.push(m.text());
	});
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto(BASE + path, { waitUntil: 'load' });
	await page.waitForTimeout(700);
	return { context, page, errors };
}

/** Each scenario gets `{ browser, noGL }` and reports through check(). */
const scenarios = [];

// ---- scenarios ----

scenarios.push(async ({ browser, noGL }) => {
	const desk = await open(browser, '/projects/');
	check((await attr(desk.page, 'page', 'data-ripple-state')) === 'live', '/projects desktop: page board live');
	check((await attr(desk.page, 'page', 'data-ripple-awake')) === 'false', '/projects desktop: sim idle before any interaction');
	await desk.page.screenshot({ path: `${OUT}/projects-desktop.png` });
	check(desk.errors.length === 0, `/projects desktop: no console errors ${JSON.stringify(desk.errors)}`);
	await desk.context.close();

	const phone = await open(browser, '/projects/', { viewport: PHONE });
	check((await attr(phone.page, 'page', 'data-ripple-state')) === 'off', '/projects phone: page board off');
	check(phone.errors.length === 0, `/projects phone: no console errors ${JSON.stringify(phone.errors)}`);
	await phone.context.close();

	const reduced = await open(browser, '/projects/', { reducedMotion: 'reduce' });
	check((await attr(reduced.page, 'page', 'data-ripple-state')) === 'static', '/projects reduced motion: static board');
	check(reduced.errors.length === 0, `/projects reduced motion: no console errors ${JSON.stringify(reduced.errors)}`);
	await reduced.context.close();

	const flat = await open(noGL, '/projects/', { allowGLErrors: true });
	check((await attr(flat.page, 'page', 'data-ripple-state')) === 'static', '/projects without WebGL: static board');
	check(flat.errors.length === 0, `/projects without WebGL: no console errors ${JSON.stringify(flat.errors)}`);
	await flat.context.close();
});

scenarios.push(async ({ browser }) => {
	const { context, page, errors } = await open(browser, '/projects/');
	await page.hover('header a[href="/about"]');
	await page.waitForTimeout(100);
	check((await attr(page, 'page', 'data-ripple-awake')) === 'true', 'interactions: hovering a link wakes the board');
	for (const row of await page.$$('.log-entry a')) await row.hover();
	await page.waitForTimeout(200);
	check((await attr(page, 'page', 'data-ripple-state')) === 'live', 'interactions: survives a fast hover sweep down the log');
	await page.mouse.move(5, 450);
	await page.mouse.down();
	await page.mouse.up();
	await page.waitForTimeout(1200);
	await page.screenshot({ path: `${OUT}/projects-transmit.png` });
	const t0 = Date.now();
	await waitForAttr(page, 'page', 'rippleAwake', 'false', 90_000);
	check((await attr(page, 'page', 'data-ripple-awake')) === 'false', `interactions: sim goes idle at rest (${Math.round((Date.now() - t0) / 1000)}s)`);
	check(errors.length === 0, `interactions: no console errors ${JSON.stringify(errors)}`);
	await context.close();
});

scenarios.push(async ({ browser }) => {
	const { context, page, errors } = await open(browser, '/projects/');
	await page.keyboard.press('Tab');
	await page.waitForTimeout(100);
	check((await attr(page, 'page', 'data-ripple-awake')) === 'true', 'keyboard: tabbing onto a link pings');
	check(errors.length === 0, `keyboard: no console errors ${JSON.stringify(errors)}`);
	await context.close();
});

scenarios.push(async ({ browser }) => {
	const { context, page, errors } = await open(browser, '/projects/');
	await Promise.all([page.waitForEvent('load'), page.click('header a[href="/projects"]')]);
	await waitForAttr(page, 'page', 'rippleArrivals', '1', 5000);
	check((await attr(page, 'page', 'data-ripple-arrivals')) === '1', 'arrival: clicking a nav link pings once on the next page');
	await page.focus('header a[href="/projects"]');
	await Promise.all([page.waitForEvent('load'), page.keyboard.press('Enter')]);
	await waitForAttr(page, 'page', 'rippleArrivals', '1', 5000);
	check((await attr(page, 'page', 'data-ripple-arrivals')) === '1', 'arrival: keyboard Enter on a link pings once on the next page');
	check(errors.length === 0, `arrival: no console errors ${JSON.stringify(errors)}`);
	await context.close();
});

// ---- runner ----

async function main() {
	const server = spawn(process.execPath, ['node_modules/astro/bin/astro.mjs', 'preview', '--port', String(PORT)], { stdio: 'ignore' });
	try {
		for (let i = 0; ; i++) {
			try {
				if ((await fetch(BASE)).ok) break;
			} catch {
				// not up yet
			}
			if (i > 150) throw new Error('astro preview did not start (did you run `npm run build`?)');
			await new Promise((r) => setTimeout(r, 200));
		}
		await mkdir(OUT, { recursive: true });
		const browser = await launch(GL_ARGS);
		const noGL = await launch(['--disable-webgl', '--disable-webgl2', '--disable-3d-apis']);
		for (const run of scenarios) await run({ browser, noGL });
		await browser.close();
		await noGL.close();
	} finally {
		server.kill();
	}
	console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nall checks passed');
	process.exit(failures.length ? 1 : 0);
}

await main();
