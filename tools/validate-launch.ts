import { publisherDetailsComplete } from '../src/config/publisher';
import { buildAppEnv, readProcessEnv } from '../src/config/env';

if (!publisherDetailsComplete()) {
  throw new Error(
    'Public launch is blocked: complete src/config/publisher.ts and review the policy pages. Preview builds remain available.',
  );
}
buildAppEnv(readProcessEnv(), { mode: 'production' });
console.log('Owner policy details and production environment are ready.');
