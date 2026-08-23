import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';
import rss from '@astrojs/rss';
import { SITE_DESCRIPTION, SITE_TITLE } from '../consts';

export async function GET(context: APIContext) {
	const projects = (await getCollection('projects')).sort(
		(a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf(),
	);
	return rss({
		title: SITE_TITLE,
		description: SITE_DESCRIPTION,
		site: context.site!,
		items: projects.map((project) => ({
			title: project.data.title,
			description: project.data.description,
			pubDate: project.data.pubDate,
			link: `/projects/${project.id}/`,
		})),
	});
}
