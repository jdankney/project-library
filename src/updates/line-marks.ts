import { diffLines } from 'diff';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

/** What one update did to one rendered block. `rmTop`/`rmBottom` mark where removed text used to be. */
export interface BlockMark {
	kind?: 'add' | 'chg';
	rmTop?: true;
	rmBottom?: true;
}
/** Block start line (1-based, in the current body) to its mark. */
export type Marks = Map<number, BlockMark>;

/** Lines an edit touched, in the new body's numbering (1-based). */
export interface LineChanges {
	/** Line → 'add' (brand new line) or 'chg' (replaced an old line). */
	lines: Map<number, 'add' | 'chg'>;
	/** Removal points: removed text sat just before this new line (lineCount + 1 = after the end). */
	removedAt: number[];
}

const countLines = (s: string) => (s === '' ? 0 : s.split('\n').length - (s.endsWith('\n') ? 1 : 0));
/** Post bodies are trimmed, so the last line has no newline; without this an edit after it would mark it changed. */
const eol = (s: string) => (s === '' || s.endsWith('\n') ? s : `${s}\n`);

export function lineChanges(oldBody: string, newBody: string): LineChanges {
	const lines = new Map<number, 'add' | 'chg'>();
	const removedAt: number[] = [];
	let n = 1;
	const parts = diffLines(eol(oldBody), eol(newBody));
	for (let i = 0; i < parts.length; i++) {
		const p = parts[i];
		const count = p.count ?? countLines(p.value);
		if (p.removed) {
			const next = parts[i + 1];
			if (next?.added) {
				const added = next.count ?? countLines(next.value);
				for (let k = 0; k < added; k++) lines.set(n + k, 'chg');
				n += added;
				i++;
			} else removedAt.push(n);
		} else if (p.added) {
			for (let k = 0; k < count; k++) lines.set(n + k, 'add');
			n += count;
		} else n += count;
	}
	return { lines, removedAt };
}

/** Old line → new line (1-based), or 0 when the line didn't survive. */
export function lineMap(oldBody: string, newBody: string): number[] {
	const map = [0];
	let n = 1;
	for (const p of diffLines(eol(oldBody), eol(newBody))) {
		const count = p.count ?? countLines(p.value);
		if (p.added) n += count;
		else if (p.removed) for (let k = 0; k < count; k++) map.push(0);
		else for (let k = 0; k < count; k++) map.push(n++);
	}
	return map;
}

/** Carry a LineChanges forward through a later edit. Lines that were deleted later drop out. */
function carry(ch: LineChanges, from: string, to: string): LineChanges {
	const map = lineMap(from, to);
	const toCount = countLines(to);
	const lines = new Map<number, 'add' | 'chg'>();
	for (const [line, kind] of ch.lines) if (map[line]) lines.set(map[line], kind);
	const removedAt = ch.removedAt.map((at) => {
		for (let l = at; l < map.length; l++) if (map[l]) return map[l];
		return toCount + 1;
	});
	return { lines, removedAt };
}

/** Top-level block line ranges of a body, exactly as Astro's Markdown parser sees them. */
export function topLevelBlocks(body: string): { start: number; end: number }[] {
	const tree = unified().use(remarkParse).use(remarkGfm).parse(body);
	return tree.children
		.filter((node) => node.position && node.type !== 'definition' && node.type !== 'footnoteDefinition')
		.map((node) => ({ start: node.position!.start.line, end: node.position!.end.line }));
}

/** Turn line changes (already in the current body's numbering) into per-block marks. */
export function marksFor(ch: LineChanges, body: string): Marks {
	const blocks = topLevelBlocks(body);
	const text = body.split('\n');
	const marks: Marks = new Map();
	const mark = (start: number) => marks.get(start) ?? marks.set(start, {}).get(start)!;
	for (const b of blocks) {
		let touched = false;
		let allAdded = true;
		for (let l = b.start; l <= b.end; l++) {
			const kind = ch.lines.get(l);
			if (kind) touched = true;
			if (kind !== 'add' && text[l - 1]?.trim()) allAdded = false;
		}
		if (touched) mark(b.start).kind = allAdded ? 'add' : 'chg';
	}
	for (const at of ch.removedAt) {
		const inside = blocks.find((b) => b.start < at && at <= b.end);
		if (inside) {
			mark(inside.start).kind ??= 'chg';
			continue;
		}
		const next = blocks.find((b) => b.start >= at);
		if (next) mark(next.start).rmTop = true;
		else if (blocks.length) mark(blocks[blocks.length - 1].start).rmBottom = true;
	}
	return marks;
}

/**
 * Marks for every update, keyed by hash. `updates` is newest first, each with
 * the body it produced; `current` is the post as it is now (it may hold
 * unmarked edits made after the newest update).
 */
export function updateMarks(
	updates: { hash: string; oldBody: string; newBody: string }[],
	current: string,
): Map<string, Marks> {
	const result = new Map<string, Marks>();
	updates.forEach((u, i) => {
		let ch = lineChanges(u.oldBody, u.newBody);
		let at = u.newBody;
		for (let k = i - 1; k >= 0; k--) {
			ch = carry(ch, at, updates[k].newBody);
			at = updates[k].newBody;
		}
		ch = carry(ch, at, current);
		result.set(u.hash, marksFor(ch, current));
	});
	return result;
}

/** CSS that switches on one update's marks. Pairs with the static `.post-body` rules in ProjectPost.astro. */
export function marksCss(marks: Marks): string {
	const sel = (lines: number[]) => lines.map((l) => `.post-body > [data-line="${l}"]`).join(',\n');
	const by = (pick: (m: BlockMark) => boolean) => [...marks].filter(([, m]) => pick(m)).map(([l]) => l);
	const rules: string[] = [];
	const add = by((m) => m.kind === 'add');
	const chg = by((m) => m.kind === 'chg');
	const top = by((m) => !!m.rmTop);
	const bottom = by((m) => !!m.rmBottom);
	if (add.length) rules.push(`${sel(add)} { --upd-bar: var(--upd-add); }`);
	if (chg.length) rules.push(`${sel(chg)} { --upd-bar: var(--upd-chg); }`);
	// one notch per block; when a block has both, the top one (written last) wins
	if (bottom.length) rules.push(`${sel(bottom)} { --upd-rm: block; --upd-rm-y: calc(100% - 0.3rem); }`);
	if (top.length) rules.push(`${sel(top)} { --upd-rm: block; --upd-rm-y: -0.35rem; }`);
	return rules.join('\n');
}
