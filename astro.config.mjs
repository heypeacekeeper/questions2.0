// @ts-check
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';
import { loadEnv } from 'vite';
import { SITE_URL, isSitemapEligible } from './src/config/site-static.mjs';
import buildArtifacts from './src/scripts/build-artifacts.ts';

/**
 * Astro configuration.
 *
 * Rendering model:
 *  - Every content/SEO page is prerendered (Astro default, `output: 'static'`).
 *  - Only the API endpoints under `src/pages/api/` opt into on-demand rendering
 *    via `export const prerender = false`.
 *  - The Cloudflare adapter targets Workers with static assets (not the
 *    deprecated Pages integration).
 */
const demoMode = process.env.ALLOW_DEMO_CONTENT === 'true';
const envDirectory = demoMode
  ? fileURLToPath(new URL('./tools/mock-env', import.meta.url))
  : process.cwd();
const canonicalSite = (
  loadEnv(demoMode ? 'demo' : 'production', envDirectory, 'PUBLIC_SITE_URL').PUBLIC_SITE_URL ||
  SITE_URL
).replace(/\/+$/, '');

export default defineConfig({
  site: canonicalSite,
  output: 'static',
  trailingSlash: 'always',
  redirects: {
    '/play': { destination: '/would-you-rather-questions-game/', status: 301 },
  },
  prerenderConflictBehavior: 'error',
  build: {
    format: 'directory',
    inlineStylesheets: 'auto',
  },
  compressHTML: true,
  devToolbar: { enabled: false },
  // No client-side view transitions / SPA router. Native navigation only;
  // prefetch just warms the cache on hover.
  prefetch: { prefetchAll: false, defaultStrategy: 'hover' },
  // Sessions would provision a KV namespace we do not need.
  session: false,
  adapter: cloudflare({
    // Build-time content loading uses Node (process.env, crypto) — run the
    // prerender step in Node instead of workerd.
    prerenderEnvironment: 'node',
    imageService: 'compile',
  }),
  integrations: [
    sitemap({
      filter: isSitemapEligible,
      changefreq: 'weekly',
      priority: 0.7,
    }),
    buildArtifacts(canonicalSite),
  ],
  vite: {
    define: {
      'import.meta.env.PUBLIC_SITE_URL': JSON.stringify(canonicalSite),
    },
    // Demo builds use an isolated env directory so an owner's .env cannot
    // accidentally alter the local preview.
    envDir: demoMode ? fileURLToPath(new URL('./tools/mock-env', import.meta.url)) : undefined,
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    build: {
      // Keep scripts external so the strict Content Security Policy can execute them.
      assetsInlineLimit: 0,
      // Keep the client bundle honest: no source maps shipped to production.
      sourcemap: false,
    },
  },
});
