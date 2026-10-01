/** Keep old hashed assets out of the next build and its size report. */
import { existsSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

const projectRoot = realpathSync(process.cwd());
const output = resolve(projectRoot, 'dist');
if (dirname(output) !== projectRoot || basename(output) !== 'dist') {
  throw new Error('Refusing to clean a directory outside this project.');
}
if (existsSync(output)) {
  for (const entry of readdirSync(output, { withFileTypes: true })) {
    const target = resolve(output, entry.name);
    if (dirname(target) !== output)
      throw new Error('Refusing to clean outside the build directory.');

    // A local preview can hold these directories open on Windows. Their contents
    // are still safe to replace, and keeping the directory avoids EBUSY.
    if (entry.isDirectory() && (entry.name === 'client' || entry.name === 'server')) {
      for (const child of readdirSync(target)) {
        // Wrangler's live preview owns this cache; it is not a build artifact.
        if (entry.name === 'server' && child === '.wrangler') continue;
        const childPath = resolve(target, child);
        if (dirname(childPath) !== target) {
          throw new Error('Refusing to clean outside the build directory.');
        }
        rmSync(childPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      }
    } else {
      rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  }
}
