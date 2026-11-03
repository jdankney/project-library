import type { Root, RootContent } from 'mdast';

/** Blocks that scroll sideways (or get swapped out by the highlighter) are wrapped so their sign has a stable home. */
const WRAP = new Set(['code', 'table']);

/**
 * Tag each top-level block of a project post with `data-line` (its first
 * source line in the post body) so the page can point update signs at it
 * with CSS. Runs on the Markdown tree, before Astro's code highlighter
 * replaces `<pre>` elements. Depends only on the file's text, so it stays
 * correct when Astro reuses a cached render after a commit message changes.
 */
export default function remarkLineTags() {
	return (tree: Root, file: { path?: string }) => {
		if (!file.path?.replaceAll('\\', '/').includes('/src/content/projects/')) return;
		tree.children = tree.children.map((node): RootContent => {
			if (!node.position) return node;
			const dataLine = String(node.position.start.line);
			if (WRAP.has(node.type)) {
				// an unknown node with hName becomes that element, children and all
				return {
					type: 'updWrap',
					data: { hName: 'div', hProperties: { dataLine, className: ['upd-wrap'] } },
					children: [node],
					position: node.position,
				} as unknown as RootContent;
			}
			node.data = { ...node.data, hProperties: { ...node.data?.hProperties, dataLine } };
			return node;
		});
	};
}
