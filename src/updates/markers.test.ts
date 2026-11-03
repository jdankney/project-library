import { describe, expect, it } from 'vitest';
import { parseMarker } from './markers';

describe('parseMarker', () => {
	it('reads one slug and a summary', () => {
		expect(parseMarker('update(pihole-mdns): ripped it back out')).toEqual({
			slugs: ['pihole-mdns'],
			version: null,
			summary: 'ripped it back out',
		});
	});

	it('pulls a leading version token out of the summary', () => {
		expect(parseMarker('update(esp32s3-solar-meshnode): v1.0 finished the base node')).toEqual({
			slugs: ['esp32s3-solar-meshnode'],
			version: 'v1.0',
			summary: 'finished the base node',
		});
	});

	it('lowercases the version and accepts one or many dotted parts', () => {
		expect(parseMarker('update(a): V2 rebuilt')?.version).toBe('v2');
		expect(parseMarker('update(a): v0.3.1 hotfix')?.version).toBe('v0.3.1');
	});

	it('does not treat a word starting with v as a version', () => {
		expect(parseMarker('update(a): vent holes drilled')).toMatchObject({ version: null, summary: 'vent holes drilled' });
	});

	it('reads several slugs, with or without spaces after commas', () => {
		expect(parseMarker('update(a,b, c): renumbered')?.slugs).toEqual(['a', 'b', 'c']);
	});

	it('ignores commits without the marker', () => {
		expect(parseMarker('fix typo in pihole post')).toBeNull();
		expect(parseMarker('feat(ripple): hover pings')).toBeNull();
		expect(parseMarker('update: no slug')).toBeNull();
		expect(parseMarker('update(): empty')).toBeNull();
		expect(parseMarker('update(a):')).toBeNull();
	});
});
