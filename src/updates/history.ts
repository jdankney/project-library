import { execFileSync } from 'node:child_process';
import { basename, dirname, relative, resolve } from 'node:path';
import { parseMarker } from './markers';

/** One marked update to a post, with the post body before and after it. */
export interface Update {
	hash: string;
	date: Date;
	/** 'YYYY-MM-DD' in the author's own timezone, which is the day the update was actually made. */
	day: string;
	version: string | null;
	summary: string;
	/** Body (frontmatter stripped) at the previous marked update, or just before the first one. */
	oldBody: string;
	newBody: string;
}

const HELP = 'Post update history is read from git at build time (see README: Publishing a post update).';

export class HistoryError extends Error {
	constructor(detail: string) {
		super(`${detail}\n${HELP}`);
		this.name = 'HistoryError';
	}
}

function git(cwd: string, args: string[]): string {
	try {
		return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
	} catch (err) {
		const stderr = (err as { stderr?: string }).stderr?.trim();
		throw new HistoryError(`git ${args.join(' ')} failed${stderr ? `: ${stderr}` : ''}`);
	}
}

/**
 * The Markdown body exactly as Astro renders it (frontmatter removed, then
 * trimmed), so line numbers here match the rendered blocks' source lines.
 */
export function postBody(raw: string): string {
	return raw.replace(/^(?:﻿?|\s*\n)---\r?\n[\s\S]*?\r?\n---/, '').trim();
}

const slugOf = (path: string) => basename(path).replace(/\.mdx?$/, '');

interface FileCommit {
	hash: string;
	date: Date;
	day: string;
	subject: string;
	/** The file's repo-relative path at this commit (it follows renames). */
	path: string;
}

/** Every commit that touched the file, oldest first, following renames. */
function fileCommits(root: string, relPath: string): FileCommit[] {
	const out = git(root, ['log', '--follow', '--name-status', '--format=%x1e%H%x1f%aI%x1f%s', '--', relPath]);
	const commits: FileCommit[] = [];
	for (const chunk of out.split('\x1e').slice(1)) {
		const [header, ...rest] = chunk.split('\n');
		const [hash, iso, subject] = header.split('\x1f');
		const status = rest.find((l) => /^[AMRC]/.test(l));
		if (!status) continue;
		const cols = status.split('\t');
		// %aI keeps the author's UTC offset, so its date part is their local calendar day
		commits.push({ hash, date: new Date(iso), day: iso.slice(0, 10), subject, path: cols[cols.length - 1] });
	}
	return commits.reverse();
}

const repoRoot = (filePath: string) => git(dirname(resolve(filePath)), ['rev-parse', '--show-toplevel']).trim();

const memo = new Map<string, Update[]>();

/**
 * Marked updates for one post file, newest first. A commit counts when its
 * subject is `update(<slugs>): …` and one of the slugs is any name the file
 * has had. Unmarked edits between two marked updates fold into the later one.
 */
export function readUpdates(filePath: string): Update[] {
	const root = repoRoot(filePath);
	const relPath = relative(root, resolve(filePath));
	const head = git(root, ['rev-parse', 'HEAD']).trim();
	const key = `${head}:${relPath}`;
	const cached = memo.get(key);
	if (cached) return cached;

	const commits = fileCommits(root, relPath);
	const names = new Set(commits.map((c) => slugOf(c.path)));
	const bodyAt = (c: FileCommit) => postBody(git(root, ['show', `${c.hash}:${c.path}`]));

	const updates: Update[] = [];
	let previous: string | null = null;
	commits.forEach((c, i) => {
		const marker = parseMarker(c.subject);
		if (!marker || !marker.slugs.some((s) => names.has(s))) return;
		const newBody = bodyAt(c);
		const oldBody = previous ?? (i > 0 ? bodyAt(commits[i - 1]) : '');
		updates.push({ hash: c.hash, date: c.date, day: c.day, version: marker.version, summary: marker.summary, oldBody, newBody });
		previous = newBody;
	});
	updates.reverse();
	memo.set(key, updates);
	return updates;
}

/**
 * Marker slugs that no file under `dir` has ever been named, with the commit
 * that used them. Catches typos like `update(esp32-solar)`.
 */
export function unknownMarkerSlugs(dir: string): { hash: string; slug: string }[] {
	const root = git(resolve(dir), ['rev-parse', '--show-toplevel']).trim();
	const rel = relative(root, resolve(dir));
	const everNamed = new Set(
		git(root, ['log', '--name-only', '--format=', '--', rel])
			.split('\n')
			.filter((l) => /\.mdx?$/.test(l))
			.map(slugOf),
	);
	const unknown: { hash: string; slug: string }[] = [];
	for (const line of git(root, ['log', '--format=%H%x1f%s']).split('\n')) {
		const [hash, subject] = line.split('\x1f');
		const marker = subject ? parseMarker(subject) : null;
		for (const slug of marker?.slugs ?? []) if (!everNamed.has(slug)) unknown.push({ hash, slug });
	}
	return unknown;
}
