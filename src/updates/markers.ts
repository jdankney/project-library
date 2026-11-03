/** A parsed `update(<slugs>): [vX.Y] <summary>` commit subject. */
export interface Marker {
	slugs: string[];
	version: string | null;
	summary: string;
}

const MARKER = /^update\(([^)]+)\):\s*(.+)$/;
const VERSION = /^(v\d+(?:\.\d+)*)\b\s*/i;

/** Parse a commit subject. Returns null for commits that aren't post updates. */
export function parseMarker(subject: string): Marker | null {
	const m = MARKER.exec(subject.trim());
	if (!m) return null;
	const slugs = m[1].split(',').map((s) => s.trim()).filter(Boolean);
	if (!slugs.length) return null;
	let summary = m[2].trim();
	const v = VERSION.exec(summary);
	const version = v ? v[1].toLowerCase() : null;
	if (v) summary = summary.slice(v[0].length).trim();
	return { slugs, version, summary };
}
