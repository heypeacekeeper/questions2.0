# Tasks

## Completed

- [x] Astro + Cloudflare Workers, strict TypeScript, static content generation, SEO, share pages, and category pagination.
- [x] Versioned JSON question and category files with build-time validation and local CSV import/export.
- [x] Game result percentages generated locally from question IDs; selections do not make a request or store a vote.
- [x] Game session storage prevents repeated questions, and game packs load as needed.
- [x] Performance budgets cover HTML, JavaScript, CSS, fonts, and game packs.
- [x] Contact and question-submission pages provide email links without a writable backend.

## Owner setup before publication

- [ ] Replace or archive all published demo questions, then add and review original questions in the JSON files.
- [ ] Run `npm run validate:content` and `npm run build` with demo content disallowed.
- [ ] Confirm that the public contact email address can receive messages.
- [ ] Replace legal-page placeholders and review privacy, editorial, and terms text.
- [ ] Review desktop and mobile pages with real content, then connect the Cloudflare domain and deploy.
