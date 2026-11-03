import { diffArrays } from 'diff';
import { splitBlocks } from './blocks';

export type DiffPart = { op: 'eq' | 'ins' | 'del'; text: string };
export type DiffBlock =
	| { kind: 'added'; text: string }
	| { kind: 'removed'; text: string }
	| { kind: 'changed'; parts: DiffPart[] }
	| { kind: 'image'; op: 'added' | 'removed' | 'replaced'; from?: string; to?: string };
export interface Hunk {
	/** '## Result', or '(intro)' for changes above the first heading. */
	heading: string;
	blocks: DiffBlock[];
}
export interface ProseDiff {
	hunks: Hunk[];
	/** Words added and removed, for the stat bar. */
	added: number;
	removed: number;
}

/** Unchanged words kept on each side of a change inside a changed block; longer runs are cut with `…`. */
const CONTEXT_WORDS = 8;
/** Below this share of common words, a rewritten block shows as removed + added instead of a word diff. */
const SIMILARITY = 0.5;
const IMAGE = /!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
const HEADING = /^(#{1,6})\s+(.*)$/;

const fileName = (src: string) => src.split('/').pop() ?? src;
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Image file names, if the block is nothing but images. */
function imageOnly(block: string): string[] | null {
	const names = [...block.matchAll(IMAGE)].map((m) => fileName(m[2]));
	return names.length && block.replace(IMAGE, '').trim() === '' ? names : null;
}

/** Markdown source to readable text: no link targets, emphasis or code markers, list markers as bullets. */
export function displayText(block: string): string {
	const fenced = /^\s*(```|~~~)/.test(block);
	if (fenced) return block.split('\n').slice(1, -1).join('\n');
	return block
		.split('\n')
		.map((line) =>
			line
				.replace(/^\s{0,3}>\s?/, '')
				.replace(/^#{1,6}\s+/, '')
				.replace(/^(\s*)(?:[-*+]|\d+[.)])\s+/, '$1• ')
				.replace(IMAGE, (_m, _alt, src) => `[image: ${fileName(src)}]`)
				.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
				.replace(/(\*\*|__)(.+?)\1/g, '$2')
				.replace(/(^|[^\w*])[*_](?=\S)(.+?)(?<=\S)[*_](?![\w*])/g, '$1$2')
				.replace(/`+([^`]+)`+/g, '$1')
				.replace(/\s+$/, ''),
		)
		.join('\n');
}

/**
 * Merge a word diff into readable runs: `a month` → `9 weeks` instead of
 * del(a) ins(9) eq( ) del(month) ins(weeks). Whitespace between two changes
 * joins the run; within a run all removed text comes before added text.
 */
function tidy(raw: DiffPart[]): DiffPart[] {
	const out: DiffPart[] = [];
	let del = '';
	let ins = '';
	const flush = () => {
		if (del) out.push({ op: 'del', text: del });
		if (ins) out.push({ op: 'ins', text: ins });
		del = ins = '';
	};
	raw.forEach((p, i) => {
		const inRun = del || ins;
		const bridge = p.op === 'eq' && inRun && /^\s+$/.test(p.text) && raw[i + 1] && raw[i + 1].op !== 'eq';
		if (p.op === 'del') del += p.text;
		else if (p.op === 'ins') ins += p.text;
		else if (bridge) {
			del += p.text;
			ins += p.text;
		} else {
			flush();
			const last = out[out.length - 1];
			if (last?.op === 'eq') last.text += p.text;
			else out.push({ ...p });
		}
	});
	flush();
	return out;
}

/** Keep `n` words from the start or the end of a run of unchanged text. */
function keepWords(text: string, n: number, from: 'start' | 'end'): string {
	const tokens = text.split(/(\s+)/);
	let seen = 0;
	if (from === 'start') {
		for (let i = 0; i < tokens.length; i++) if (tokens[i].trim() && ++seen > n) return tokens.slice(0, i).join('').trimEnd();
		return text;
	}
	for (let i = tokens.length - 1; i >= 0; i--) if (tokens[i].trim() && ++seen > n) return tokens.slice(i + 1).join('').trimStart();
	return text;
}

/** Cut long unchanged runs down to a little context around each change. */
function elide(parts: DiffPart[]): DiffPart[] {
	return parts.map((p, i) => {
		if (p.op !== 'eq' || words(p.text) <= CONTEXT_WORDS) return p;
		const first = i === 0;
		const last = i === parts.length - 1;
		if (first) return { op: 'eq', text: `…${keepWords(p.text, CONTEXT_WORDS, 'end')}` };
		if (last) return { op: 'eq', text: `${keepWords(p.text, CONTEXT_WORDS, 'start')}…` };
		if (words(p.text) <= CONTEXT_WORDS * 2) return p;
		return { op: 'eq', text: `${keepWords(p.text, CONTEXT_WORDS, 'start')} … ${keepWords(p.text, CONTEXT_WORDS, 'end')}` };
	});
}

function headingLabel(block: string): string | null {
	const m = HEADING.exec(block.split('\n')[0]);
	return m ? `${m[1]} ${displayText(m[2])}` : null;
}

/** Diff whole whitespace-separated words, so `V1.0` → `V0.3` stays one swap instead of three fragments. */
function wordDiff(a: string, b: string): DiffPart[] {
	const tokens = (s: string) => s.split(/(\s+)/).filter(Boolean);
	return diffArrays(tokens(a), tokens(b)).map((c) => ({
		op: c.added ? 'ins' : c.removed ? 'del' : 'eq',
		text: c.value.join(''),
	}));
}

function similarity(a: string, b: string): number {
	let common = 0;
	for (const p of wordDiff(a, b)) if (p.op === 'eq') common += words(p.text);
	return common / Math.max(words(a), words(b), 1);
}

/** A readable, section-labelled word diff between two post bodies. */
export function diffProse(oldBody: string, newBody: string): ProseDiff {
	const oldBlocks = splitBlocks(oldBody).map((b) => b.text);
	const newBlocks = splitBlocks(newBody).map((b) => b.text);
	const changes = diffArrays(oldBlocks.map(norm), newBlocks.map(norm));

	const hunks: Hunk[] = [];
	let heading = '(intro)';
	let added = 0;
	let removed = 0;
	let oi = 0;
	let ni = 0;
	const emit = (block: DiffBlock) => {
		const last = hunks[hunks.length - 1];
		if (last && last.heading === heading) last.blocks.push(block);
		else hunks.push({ heading, blocks: [block] });
	};
	const addBlock = (src: string) => {
		heading = headingLabel(src) ?? heading;
		const imgs = imageOnly(src);
		if (imgs) return emit({ kind: 'image', op: 'added', to: imgs.join(', ') });
		const text = displayText(src);
		added += words(text);
		emit({ kind: 'added', text });
	};
	const removeBlock = (src: string) => {
		const imgs = imageOnly(src);
		if (imgs) return emit({ kind: 'image', op: 'removed', from: imgs.join(', ') });
		const text = displayText(src);
		removed += words(text);
		emit({ kind: 'removed', text });
	};
	const changeBlock = (from: string, to: string) => {
		heading = headingLabel(to) ?? heading;
		const a = imageOnly(from);
		const b = imageOnly(to);
		if (a && b) return emit({ kind: 'image', op: 'replaced', from: a.join(', '), to: b.join(', ') });
		const parts = tidy(wordDiff(displayText(from), displayText(to)));
		for (const p of parts) {
			if (p.op === 'ins') added += words(p.text);
			if (p.op === 'del') removed += words(p.text);
		}
		emit({ kind: 'changed', parts: elide(parts) });
	};

	for (let i = 0; i < changes.length; i++) {
		const c = changes[i];
		const n = c.value.length;
		if (!c.added && !c.removed) {
			for (let k = 0; k < n; k++) heading = headingLabel(newBlocks[ni + k]) ?? heading;
			oi += n;
			ni += n;
			continue;
		}
		if (c.removed && changes[i + 1]?.added) {
			const olds = oldBlocks.slice(oi, oi + n);
			const news = newBlocks.slice(ni, ni + changes[i + 1].value.length);
			oi += olds.length;
			ni += news.length;
			i++;
			for (let k = 0; k < Math.max(olds.length, news.length); k++) {
				const from = olds[k];
				const to = news[k];
				if (from === undefined) addBlock(to);
				else if (to === undefined) removeBlock(from);
				else if (similarity(displayText(from), displayText(to)) >= SIMILARITY) changeBlock(from, to);
				else {
					removeBlock(from);
					addBlock(to);
				}
			}
			continue;
		}
		if (c.added) {
			for (const src of newBlocks.slice(ni, ni + n)) addBlock(src);
			ni += n;
		} else {
			for (const src of oldBlocks.slice(oi, oi + n)) removeBlock(src);
			oi += n;
		}
	}
	return { hunks, added, removed };
}

/** `git log --stat` style bar: at most `width` glyphs, split by share, never hiding a nonzero side. */
export function statBar(added: number, removed: number, width = 10): { plus: number; minus: number } {
	const total = added + removed;
	if (total <= width) return { plus: added, minus: removed };
	let plus = Math.round((width * added) / total);
	if (added && !plus) plus = 1;
	if (removed && plus === width) plus = width - 1;
	return { plus, minus: width - plus };
}
