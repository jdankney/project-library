/**
 * Moves a post's gutter signs to whichever update is open in its log. The
 * newest update's signs ship in the HTML; this only swaps them, so with
 * JavaScript off the page still shows the newest.
 */
export function wireUpdateLog(): void {
	const style = document.querySelector<HTMLStyleElement>('style[data-update-marks]');
	const data = document.getElementById('update-marks');
	if (!style || !data) return;
	const css = JSON.parse(data.textContent || '{}') as Record<string, string>;
	const entries = [...document.querySelectorAll<HTMLDetailsElement>('details[data-update]')];
	const newest = entries[0]?.dataset.update ?? '';
	const show = (hash: string) => {
		style.textContent = css[hash] ?? '';
		style.dataset.showing = hash;
	};
	style.dataset.showing = newest;
	for (const entry of entries) {
		entry.addEventListener('toggle', () => {
			if (entry.open) {
				for (const other of entries) if (other !== entry) other.open = false;
				show(entry.dataset.update ?? newest);
			} else if (!entries.some((e) => e.open)) show(newest);
		});
	}
}
