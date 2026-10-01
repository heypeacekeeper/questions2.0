# Tasks

## Completed

- [x] Astro + Cloudflare Workers, strict TypeScript, static content generation, SEO, share pages, and category pagination.
- [x] Versioned JSON question and category files with build-time validation and local CSV import/export.
- [x] Game result percentages generated locally from question IDs; selections do not make a request or store a vote.
- [x] Game session storage prevents repeated questions, and game packs load as needed.
- [x] Performance budgets cover HTML, JavaScript, CSS, fonts, and game packs.
- [x] Contact and question-submission pages provide email links without a writable backend.

## Owner setup before publication

- [x] Remove published demo questions; the initial Kids collection contains 55 original questions.
- [ ] Add and review the remaining collections supplied by the owner.
- [ ] Run `npm run validate:content` and `npm run build` with demo content disallowed.
- [ ] Confirm that the public contact email address can receive messages.
- [ ] Complete `src/config/publisher.ts` and review privacy, editorial, and terms text; `npm run validate:launch` must pass before deployment.
- [ ] Review desktop and mobile pages with real content, then connect the Cloudflare domain and deploy.
