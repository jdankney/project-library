/** A run of Markdown source between blank lines (fenced code stays whole). Lines are 1-based. */
export interface SourceBlock {
	text: string;
	start: number;
	end: number;
}

/** Split a Markdown body into blank-line-separated blocks, keeping fenced code blocks whole. */
export function splitBlocks(body: string): SourceBlock[] {
	const lines = body.split(/\r?\n/);
	const blocks: SourceBlock[] = [];
	let cur: string[] = [];
	let start = 0;
	let fence: string | null = null;
	const flush = (endLine: number) => {
		if (cur.length) blocks.push({ text: cur.join('\n'), start, end: endLine });
		cur = [];
	};
	lines.forEach((line, i) => {
		const n = i + 1;
		const f = /^\s*(```+|~~~+)/.exec(line);
		if (fence) {
			cur.push(line);
			if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null;
			return;
		}
		if (f) fence = f[1];
		if (!fence && line.trim() === '') {
			flush(n - 1);
			return;
		}
		if (!cur.length) start = n;
		cur.push(line);
	});
	flush(lines.length);
	return blocks;
}
