// Runs before `npm run build`. Post update logs are read from git history, so
// the build needs a full (not shallow) git checkout. Deploy builds often clone
// shallow; this deepens the clone, or stops the build with a clear reason.
import { execFileSync } from 'node:child_process';

const HELP = 'See README: Publishing a post update.';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

try {
	git('rev-parse', '--is-inside-work-tree');
} catch {
	console.error(`[ensure-history] not a git checkout. Post update history needs the git repo to build. ${HELP}`);
	process.exit(1);
}

if (git('rev-parse', '--is-shallow-repository') === 'true') {
	console.log('[ensure-history] shallow clone, fetching full history for post update logs');
	try {
		execFileSync('git', ['fetch', '--unshallow', '--quiet'], { stdio: 'inherit' });
	} catch {
		console.error(`[ensure-history] couldn't fetch full git history (git fetch --unshallow failed). ${HELP}`);
		process.exit(1);
	}
}
