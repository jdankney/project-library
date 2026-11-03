/** Which update's gutter signs to show: the open entry, but only while the log itself is open. */
export function showingFor(state: { logOpen: boolean; openEntry: string | null; newest: string }): string {
	return state.logOpen && state.openEntry ? state.openEntry : state.newest;
}

/**
 * Moves a post's gutter signs to whichever update is open in its log. The
 * newest update's signs ship in the HTML; this only swaps them, so with
 * JavaScript off the page still shows the newest.
 */
export function wireUpdateLog(): void {
	const style = document.querySelector<HTMLStyleElement>('style[data-update-marks]');
	const data = document.getElementById('update-marks');
	const log = document.querySelector<HTMLDetailsElement>('details.update-log');
	if (!style || !data || !log) return;
	const css = JSON.parse(data.textContent || '{}') as Record<string, string>;
	const entries = [...document.querySelectorAll<HTMLDetailsElement>('details[data-update]')];
	const newest = entries[0]?.dataset.update ?? '';
	const sync = () => {
		const open = entries.find((e) => e.open)?.dataset.update ?? null;
		const hash = showingFor({ logOpen: log.open, openEntry: open, newest });
		style.textContent = css[hash] ?? '';
		style.dataset.showing = hash;
	};
	style.dataset.showing = newest;
	for (const entry of entries) {
		entry.addEventListener('toggle', () => {
			// one update at a time
			if (entry.open) for (const other of entries) if (other !== entry) other.open = false;
			sync();
		});
	}
	log.addEventListener('toggle', sync);
}
