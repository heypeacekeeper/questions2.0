# Would You Rather Questions

An Astro website built for Cloudflare Workers. Questions and categories live in versioned JSON files. Content pages, category pagination, share pages, and game packs are generated at build time; visitors do not request the whole question collection.

## Local development

Requires Node.js 22.12 or newer and npm 10 or newer.

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:8787`. The local command builds the current JSON questions and serves the generated Cloudflare Worker and game packs. It does not require an account, API key, or database. Restart this command after changing question files to rebuild the site.

Useful checks:

```bash
npm run check
npm run lint
npm test
npm run build:demo
npm run test:runtime:demo
npm run test:e2e
npm run test:visual
```

`npm run build` is the production build. It rejects published questions marked `isDemo: true`. Do not set `ALLOW_DEMO_CONTENT=true` for production.

Browser and screenshot tests use the production build and self-hosted fonts. Demo builds retain the local font preview control. Accessibility checks cover desktop and mobile page families as part of `test:e2e`.

## Editing questions

- Category records are in `src/content/data/categories.json`.
- Questions are in `src/content/data/questions/*.json`, grouped by their primary category. Each question appears in one file, even if its `categoryIds` include several categories.
- A question has two options, a status (`draft`, `published`, or `archived`), category IDs, a stable ID and share code, and ordering and date fields. Keep existing IDs and share codes unchanged when editing wording so saved Favorites and share links continue to work.
- Draft questions stay out of public lists and game packs. Archived questions are removed from lists while existing share URLs can still show their archived state.

For a batch of new questions, use a CSV with `option_a`, `option_b`, and `categories` columns. Separate multiple category slugs with `|`. Optional columns are `status`, `sort_order`, and `is_demo`.

```bash
npm run import:csv -- --file ./questions.csv --dry-run
npm run import:csv -- --file ./questions.csv
npm run validate:content
```

The importer writes local JSON and assigns each new question a permanent ID and share code. Review the changed JSON files before committing. `npm run validate:content` checks the content, and `npm run build` verifies a production build. Empty published categories are hidden until you add questions. To export the current collection:

```bash
npm run export:json
npm run export:csv
```

The normal monthly workflow is edit/import → validate → review → build → deploy. New questions become public after the next deployment; editing a local file does not change a live site by itself.

## How pages load

The homepage contains its selected question lists in HTML. Each category pagination URL contains up to 50 questions. The game starts with one question in the page, then loads static JSON packs of up to 40 questions as the player advances. Choosing A or B only runs the existing local animation and display percentages; it sends no vote to a server.

Hashed assets and game packs receive long-lived cache headers. The mutable game manifest and Favorites catalog use short revalidation. `npm run budget` checks emitted HTML, JavaScript, CSS, fonts, and game packs against performance limits. Self-hosted font files and licenses are in `public/fonts/`.

## Contact and submissions

The contact and question-submission pages use email links. They do not store messages on the Worker. The game, browsing, Favorites, and sharing work without a writable backend.

## Deployment

The site is configured for Cloudflare Workers in `wrangler.jsonc`. When real content is ready, run:

```bash
npm run deploy
```

The production GitHub workflow builds the same checked-in JSON and verifies the deployed commit, content manifest, homepage, and game packs. Configure `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the GitHub production environment before using that workflow. Connect the custom domain when ready; local development does not require it.

The deployment manifest and `/api/health/` expose the commit and content checksum for verification and rollback. See `docs/ROLLBACK.md` for the rollback procedure.

`npm run deploy` runs the release checks before building and publishing. Complete `src/config/publisher.ts` and review the policy pages first; `npm run validate:launch` refuses a public release while those details are unfinished. This gate also runs in the production GitHub deployment workflow. Preview/build/test commands remain available without owner details. Keep ads disabled until the responsive slots and consent integration have been implemented and verified.

Set `PUBLIC_SITE_URL` at build time for the final HTTPS origin. The sitemap, page metadata, and generated robots file use that build configuration. Runtime-only variable changes do not rebuild static pages.

The content checksum includes all published category/question fields and all Markdown blog source files, including drafts. It complements the Git commit; asset changes are tracked by Git and hashed asset filenames.

The CSV importer formats JSON and stages the entire batch before replacing files. If replacement fails it rolls back completed replacements. Interrupted/incompletely recovered imports retain sibling `.backup` files for manual recovery. CSV exports neutralize spreadsheet formula prefixes; use JSON exports when exact raw text is required.

Favorites save up to 100 questions locally; an extra save is refused rather than evicting an existing favorite. Mixed mode currently contains up to 400 questions per build. Keep that limit in mind when the corpus grows.

## Game URL

The public game lives at `/would-you-rather-questions-game/`. The legacy `/play` and `/play/` addresses redirect permanently to it. Internal links, canonical metadata and sitemap entries use the new address.

Mixed and category games choose a random starting pack, then a random unseen opening question. The first pack downloads on entry instead of waiting for Next. The prerendered question remains visible and usable during loading; answering, saving or sharing it prevents a late replacement. Further packs load as the available unseen questions run low, proceeding through the remaining packs without duplicate downloads. A fresh session loads one pack initially; returning sessions may need more if that pack has already been played. Single-question share pages keep their linked question.
