import type { Element, Root } from 'hast';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { describe, expect, it } from 'vitest';
import { topLevelBlocks } from './line-marks';
import remarkLineTags from './remark-line-tags';

/** Stand-in for Astro's highlighter: swaps every <pre> for a fresh one with no properties or position. */
function fakeHighlighter() {
	return (tree: Root) => {
		const visit = (node: Root | Element) => {
			node.children = node.children.map((child) =>
				child.type === 'element' && child.tagName === 'pre'
					? { type: 'element', tagName: 'pre', properties: { className: ['astro-code'] }, children: child.children }
					: child,
			);
			for (const child of node.children) if (child.type === 'element') visit(child);
		};
		visit(tree);
	};
}

const render = (md: string, path = '/site/src/content/projects/a.md') =>
	String(
		unified()
			.use(remarkParse)
			.use(remarkGfm)
			.use(remarkLineTags)
			.use(remarkRehype)
			.use(fakeHighlighter)
			.use(rehypeStringify)
			.processSync({ value: md, path }),
	);

describe('remarkLineTags', () => {
	const md = '## Parts\n- one\n- two\n\ntext\n\n```\ncode\n```\n\n| a |\n| - |\n| b |\n';

	it('tags each top-level block with its first source line', () => {
		const html = render(md);
		expect(html).toContain('<h2 data-line="1">');
		expect(html).toContain('<ul data-line="2">');
		expect(html).toContain('<p data-line="5">');
	});

	it('wraps code blocks and tables, and the wrapper survives the highlighter swapping the <pre>', () => {
		const html = render(md);
		expect(html).toContain('<div data-line="7" class="upd-wrap"><pre class="astro-code">');
		expect(html).toContain('<div data-line="11" class="upd-wrap"><table>');
	});

	it('uses the same line numbers the mark builder sees', () => {
		const tagged = [...render(md).matchAll(/data-line="(\d+)"/g)].map((m) => Number(m[1]));
		expect(tagged).toEqual(topLevelBlocks(md).map((b) => b.start));
	});

	it('stays aligned with the mark builder around raw HTML and footnotes', () => {
		const tricky = 'intro[^1]\n\n<div class="note">raw</div>\n\nafter\n\n[^1]: the footnote\n';
		const tagged = [...render(tricky).matchAll(/data-line="(\d+)"/g)].map((m) => Number(m[1]));
		// raw HTML can't carry the attribute, so its block just never gets a sign
		expect(tagged).toEqual([1, 5]);
		expect(topLevelBlocks(tricky).map((b) => b.start)).toEqual([1, 3, 5]);
	});

	it('leaves Markdown outside the projects collection alone', () => {
		expect(render(md, '/site/src/pages/about.md')).not.toContain('data-line');
	});
});
