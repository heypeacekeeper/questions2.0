# Production readiness audit

**Project:** Would You Rather Questions  
**Reviewed:** 1 October 2026, India time  
**Recommendation:** Hold the public launch until the items in the “Before public launch” section are resolved and the deployment checks pass. The current application is suitable for continued staging review.

The foundation is good: the production build works, the site is small, and the game runs with little JavaScript. The largest immediate problems are release checks that currently fail, unfinished policy pages, accessibility defects, and a mismatch between the content advertised and the content available. I did not find a confirmed critical security exploit in the reviewed code. That is not a security certification or a substitute for checking the deployed environment.

**No application changes were made during this audit.** Audit scripts ran separately, generated output was inspected, and source-file hashes were compared with the snapshot taken at the start. This report and its evidence are the only deliverables. The Favorites navbar change requested before this audit is part of the reviewed starting state.

## Scope and method

The review covered application architecture, page templates, routes, JSON repositories and validation, all current question records, game data generation and client behavior, Favorites, navigation, consent and analytics, advertising scaffolding, fonts and public assets, CSS, metadata and sitemap generation, importer/exporter tools, tests, CI, Cloudflare configuration, deployment verification, and operational documentation.

I built the **production** artifact, served it locally through Wrangler, crawled all generated HTML routes, exercised representative page families in Chromium, ran desktop/mobile functional tests, compared visual baselines, ran accessibility scans, simulated a slow manifest request, checked keyboard focus after removing a favorite, tested JavaScript-disabled behavior, and measured four production templates with mobile Lighthouse.

Important limits:

- This was a local code and production-artifact audit. No public deployment, DNS, live Cloudflare zone, mailbox, account permissions, or real-user traffic was available to verify.
- Browser automation used Chromium and mobile emulation. Actual iOS Safari, Firefox, screen readers, and complete browser zoom/forced-color coverage remain launch checks.
- Ads, GA4, and Cloudflare Analytics are off in the reviewed configuration. Conditional findings describe what must be verified before enabling them.
- The mature packs currently contain no published questions. Their gating findings concern future content exposure paths.
- Automated accessibility scans and dependency advisory checks have limited coverage. A passing score does not establish complete accessibility, security, or SEO readiness.

## Results at a glance

| Check                                        | Result                                                             | Interpretation                                                                             |
| -------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Production build                             | Passed                                                             | Content validation, static output, and configured size budgets completed                   |
| Type checking                                | Passed                                                             | No errors or warnings; one unused `Props` hint in the blog article route                   |
| ESLint                                       | Passed                                                             | Existing application passed lint before audit scratch files were created                   |
| Unit tests                                   | **86 passed**, 10 files                                            | Useful coverage of content, game helpers, Favorites, publication, and deployment rules     |
| Content validation                           | Passed, **10 empty-category warnings**                             | Published categories without questions are hidden                                          |
| Formatting                                   | **Failed**                                                         | `src/content/data/questions/for-kids.json` is not formatted as required                    |
| Functional browser tests                     | **24 passed, 2 failed**                                            | Both failures reference the absent Funny category link                                     |
| Existing visual baselines against production | **0 of 6 matched**                                                 | Baselines reflect older content/layout and preview typography; they need deliberate review |
| Generated HTML crawl                         | **74 routes**, no broken internal links found                      | Includes 55 share pages; tested unknown route correctly returns 404                        |
| Browser runtime sampling                     | No unexpected JS errors/resource failures in sampled page families | Expected console 404 on the intentionally missing route                                    |
| Accessibility scans                          | **25 of 36 initial-page scans had violations**                     | All reported rule failures were text contrast; occurrences repeat shared components        |
| Answered-game accessibility scan             | No violations reported                                             | One mobile state scan; does not cover every modal or interaction                           |
| Lighthouse                                   | Performance **96–97**                                              | Four mobile production templates, one laboratory run each                                  |
| Online npm advisory audit                    | **0 known vulnerabilities reported**                               | Full installed dependency tree checked on the audit date                                   |
| Source hash comparison                       | Unchanged                                                          | Existing application, content, configuration, and test files preserved                     |

The 36 accessibility scans were 18 representative routes at 390px and 1440px. They reported 178 failing node occurrences across repeated templates/viewports, not 178 independent defects. Lighthouse additionally flagged the homepage CTA’s accessible name.

### Performance measurements

| Production route                        | Performance | Accessibility | Best practices | SEO |   LCP |   FCP | TBT |   CLS |
| --------------------------------------- | ----------: | ------------: | -------------: | --: | ----: | ----: | --: | ----: |
| `/`                                     |          96 |            95 |            100 | 100 | 2.28s | 2.20s | 0ms | 0.022 |
| `/play/`                                |          97 |           100 |            100 | 100 | 2.12s | 2.12s | 0ms | 0.003 |
| `/would-you-rather-questions-for-kids/` |          96 |            95 |            100 | 100 | 2.27s | 2.20s | 0ms | 0.033 |
| `/blog/how-to-play-would-you-rather/`   |          97 |           100 |            100 | 100 | 2.13s | 2.13s | 0ms | 0.033 |

Lighthouse 13.5.0 used its mobile simulated throttling against the local production server. These are single-run laboratory observations, not field Core Web Vitals or a hosting latency guarantee. TBT is not INP. Field launch targets should use the 75th percentile: LCP ≤2.5s, INP ≤200ms, CLS ≤0.1. See [Google’s Web Vitals definitions](https://web.dev/articles/vitals).

### Current content and asset inventory

| Item                     | Current state                                     |
| ------------------------ | ------------------------------------------------- |
| Categories               | 28 definitions: 11 marked published, 17 draft     |
| Visible categories       | **1: For Kids**                                   |
| Questions                | **55 published, all For Kids, no demo questions** |
| Blog                     | One published article                             |
| Total emitted JavaScript | **15.6 KiB gzip**, budget 35 KiB                  |
| Total emitted CSS        | **15.0 KiB gzip**, budget 25 KiB                  |
| Homepage HTML            | **5.2 KiB gzip**, budget 100 KiB                  |
| Largest category HTML    | **6.8 KiB gzip**, budget 150 KiB                  |
| Largest game data pack   | **2.9 KiB gzip**, budget 25 KiB                   |
| Both font files          | **142.9 KiB raw**, budget 150 KiB                 |
| Bricolage font           | 131,548 bytes raw, about 128.5 KiB                |
| DM Mono font             | 14,820 bytes raw, about 14.5 KiB                  |
| Favorites catalog        | 9,540 bytes raw; about 4.0 KiB gzip               |
| Default social image     | 60,519 bytes raw                                  |

Gzip figures above are generated budget measurements; actual edge transfer size depends on compression and response headers. Raw font figures should not be directly compared as if they were gzip totals.

## Before public launch

### B1 — Restore a passing release gate

**Priority: High · Verified failure**

Formatting currently fails on the Kids JSON file. Both functional test failures occur at the hardcoded Funny category selector; that category has no published questions and is correctly absent from navigation. This is a test/content mismatch, not proof that the hamburger itself is broken. The CI workflow runs formatting before the browser tests, and the deployment workflow expects successful CI for the selected commit.

**Improve:** Format the content file in the implementation phase. Make navigation tests use a guaranteed published fixture or an available category, and cover the empty-category case separately. Add importer output formatting so repeated imports do not recreate the formatting failure. Do not remove the release checks to make deployment pass.

**Done when:** Formatting, all unit tests, runtime smoke tests, and all desktop/mobile browser tests pass for the exact release commit.

Evidence: [CI workflow](C:/Users/91842/Downloads/questions-main/questions-main/.github/workflows/ci.yml:27), [failing selector](C:/Users/91842/Downloads/questions-main/questions-main/tests/e2e/smoke.spec.ts:328), [Kids content](C:/Users/91842/Downloads/questions-main/questions-main/src/content/data/questions/for-kids.json), [CSV JSON writer](C:/Users/91842/Downloads/questions-main/questions-main/tools/import-csv.ts:250).

### B2 — Finish the public policy pages and align them with actual behavior

**Priority: High · Verified public placeholders**

Privacy displays `[DATE]` and an unfinished publisher/entity/address. Terms contains an unfinished entity and `[JURISDICTION]`. DMCA contains `[NAME / ADDRESS]`. Legal pages also visibly announce that they are customizable templates requiring review. These pages are currently public and indexable.

There are behavior discrepancies to resolve during that review: privacy says the chosen pack is remembered, but the current game removes the stored pack key; it also broadly describes mature confirmation although some content entry points bypass it. Advertising promises must match the completed implementation if ads are enabled.

**Improve:** Supply the real owner details, date, contact process, retention decisions, and jurisdiction; review the text for the intended audience and deployment. Remove template-only copy once the owner has finalized the policies. Verify that the published contact mailbox works. This finding identifies unfinished content and implementation mismatches; it does not determine legal compliance.

**Done when:** No owner placeholders remain and each storage/analytics/ads/content statement matches the enabled production behavior.

Evidence: [policy layout](C:/Users/91842/Downloads/questions-main/questions-main/src/layouts/ProseLayout.astro:19), [privacy](C:/Users/91842/Downloads/questions-main/questions-main/src/pages/privacy-policy/index.astro:14), [terms](C:/Users/91842/Downloads/questions-main/questions-main/src/pages/terms-and-conditions/index.astro:14), [DMCA](C:/Users/91842/Downloads/questions-main/questions-main/src/pages/dmca/index.astro:15), [pack storage removal](C:/Users/91842/Downloads/questions-main/questions-main/src/scripts/game.ts:691).

### B3 — Correct text contrast and the homepage CTA name

**Priority: High · Verified browser findings**

Repeated low-contrast text appears in shared buttons, muted descriptions, question prefixes, metadata, and labels. Examples measured by axe:

- White text on `#e33e26`: about **4.21:1** for small CTA text, below the 4.5:1 requirement used by the scan.
- `#7f776c` on `#f6f2eb`: about **3.95:1** for ordinary text, also below 4.5:1.

The visible homepage CTA says “Play game” while its accessible name is “Play the game”; Lighthouse flags the visible-label/name mismatch. Unnecessary `aria-label` overrides make this easy to introduce.

**Improve:** Adjust the shared colors or typography to satisfy contrast in normal, hover, selected, and disabled states. Let the visible CTA text supply its accessible name, or include the visible label exactly. Manually inspect focus rings on the colored game cards, including forced-color mode.

**Done when:** Representative production templates and interactive states pass the relevant contrast/name checks and keyboard focus remains clearly visible.

Evidence: [shared colors](C:/Users/91842/Downloads/questions-main/questions-main/src/styles/handoff.css:23), [navbar CTA](C:/Users/91842/Downloads/questions-main/questions-main/src/styles/handoff.css:267), [homepage CTA](C:/Users/91842/Downloads/questions-main/questions-main/src/pages/index.astro:64), accessibility and Lighthouse evidence linked below.

### B4 — Match the website’s promises to the launch content

**Priority: High for product readiness · Verified inventory**

All 55 questions are in For Kids. Ten categories marked published have no questions, so they disappear from navigation and output. The site’s broader descriptions and About content advertise collections such as funny, hard, deep, adult, couples, and other audiences that are not currently available. The homepage’s “best” selection takes one question per available category, so it currently contains just one entry and duplicates a Kids question.

**Improve:** Choose a clear launch scope. Either launch as a Kids-focused collection with matching copy, or populate and editorially review the promised collections before the general launch. Mark intentionally unfinished categories draft. Use an explicit editorial selection if “best” is intended to mean curated quality.

**Done when:** Home, About, categories, metadata, and editor picks accurately describe the content visitors can use. There is no need to invent a question-count target; choose a scope the available content supports.

Evidence: [homepage selection/copy](C:/Users/91842/Downloads/questions-main/questions-main/src/pages/index.astro:28), [About](C:/Users/91842/Downloads/questions-main/questions-main/src/pages/about-us/index.astro), [category definitions](C:/Users/91842/Downloads/questions-main/questions-main/src/content/data/categories.json).

### B5 — Explain the game percentages where users see them

**Priority: High for trust · Verified behavior**

The percentages are deterministic locally generated results between 25% and 75%, derived from question content. They are not aggregated player votes. The live screen-reader announcement includes “For-fun result,” but the visible game displays percentages without a corresponding explanation. A visitor can reasonably interpret them as real voting statistics.

**Improve:** Place a short visible label next to the result, such as “For-fun result — generated, not live votes.” Use consistent language on shared questions and wherever percentages appear. Only describe results as votes if a future backend actually records and aggregates them.

**Done when:** A sighted visitor can understand the meaning of the percentage without reading Terms or using a screen reader.

Evidence: [result generator](C:/Users/91842/Downloads/questions-main/questions-main/src/scripts/game-engine.ts:319), [game component](C:/Users/91842/Downloads/questions-main/questions-main/src/components/Game.astro:190), [mobile result screenshot](C:/Users/91842/Downloads/questions-main/questions-main/reports/production-audit-evidence-2026-10-01/play-mobile.png).

### B6 — Test the actual production typography and content

**Priority: High for release confidence · Verified configuration gap**

Normal e2e and visual configurations build with `build:demo`. `allowDemoContent` also activates system-font preview styling. Waiting for custom fonts to download does not disable that styling. Production uses the Bricolage/DM Mono presentation, so the normal suite is not exercising the same rendering.

All six old visual snapshots differ when compared with the current production artifact. The differences include changed content/height, obsolete Funny pages, and typography. Blindly accepting the new screenshots would erase the opportunity to review these changes.

**Improve:** Add a production-artifact browser/visual path. Keep any demo preview tests explicitly separate. Review and replace obsolete baselines after the intended layout and content are approved. Use real published routes in Lighthouse; its current Funny URL is absent. Run visual checks in CI if they are meant to guard releases.

**Done when:** Production fonts, navigation, current category pages, game answer state, and Favorites are covered by reviewed baselines and passing tests.

Evidence: [e2e server](C:/Users/91842/Downloads/questions-main/questions-main/playwright.config.ts:19), [visual server](C:/Users/91842/Downloads/questions-main/questions-main/playwright.visual.config.ts:28), [preview font switch](C:/Users/91842/Downloads/questions-main/questions-main/src/layouts/BaseLayout.astro:38), [font wait](C:/Users/91842/Downloads/questions-main/questions-main/tests/e2e/visual.spec.ts:20), [Lighthouse configuration](C:/Users/91842/Downloads/questions-main/questions-main/.lighthouserc.json).

## Reliability and content integrity

### R1 — Add bounded network waits and recoverable loading states

**Priority: Medium · Source verified; slow-request behavior reproduced**

Manifest, pack, and Favorites catalog requests do not have explicit timeout/abort handling. During the slow-manifest probe, the game remained busy with navigation disabled. A request that never completes can hold that state until the browser/network eventually fails it. Request-generation guards prevent some stale UI updates, but they do not cancel the obsolete downloads.

**Improve:** Use a bounded timeout with `AbortController`, cancel obsolete pack-switch requests, retain the last usable question, and expose an understandable retry state. Make Favorites retry in place instead of requiring a full reload. Test stalls, offline mode, malformed JSON, 404s, and rapid pack switching.

Evidence: [manifest/pack fetches](C:/Users/91842/Downloads/questions-main/questions-main/src/scripts/game-engine.ts:157), [catalog fetch](C:/Users/91842/Downloads/questions-main/questions-main/src/application/favorites-catalog.ts:117), [game busy/retry flow](C:/Users/91842/Downloads/questions-main/questions-main/src/scripts/game.ts:258).

### R2 — Rehearse old-tab behavior across deployments

**Priority: Medium · Deployment risk inferred from code and caching**

Game packs are content-hashed and immutable. The manifest has a five-minute browser cache lifetime and is retained in the running page. A tab opened before a deployment may request an older hashed pack later. If that asset is no longer available, Retry clears the JavaScript manifest variable but can fetch the same still-fresh browser-cached manifest and repeat the failure.

**Improve:** On a missing pack, revalidate/bypass the stale manifest cache and refresh the pack mapping once. Establish an old-asset retention or version-routing strategy appropriate to the actual Cloudflare deployment. Verify by opening a tab, deploying changed packs, then continuing that old game and rolling back.

This is a credible failure path, not a demonstrated live Cloudflare outage. Retention/routing behavior must be checked on the chosen hosting setup. See [Cloudflare version affinity guidance](https://developers.cloudflare.com/workers/versions-and-deployments/gradual-deployments/version-affinity/).

Evidence: [cache rules](C:/Users/91842/Downloads/questions-main/questions-main/public/_headers), [cached manifest](C:/Users/91842/Downloads/questions-main/questions-main/src/scripts/game.ts:448), [retry reset](C:/Users/91842/Downloads/questions-main/questions-main/src/scripts/game.ts:270).

### R3 — Strengthen the reusable JSON schema

**Priority: Medium · Reproduced with in-memory fixtures**

The current files are valid, but the validation pipeline accepted probes containing duplicate category IDs, an empty question ID, invalid date strings/null publication dates, and an entirely empty corpus. Primitive type checks do not establish valid dates or nonempty/bounded identifiers. An empty question ID can pass build validation but fail the browser pack parser. A current-dataset unit assertion catches some category problems, but the reusable validator does not enforce them itself.

**Improve:** Use a shared explicit schema for nonempty bounded IDs, unique category IDs, real timestamps, publication invariants, finite integer ordering, and browser-compatible field limits. Add a production rule requiring at least one published question and category. Keep duplicate/reversed-question and child/mature checks already present. Test malformed input through both repository loading and pure validation.

Evidence: [JSON loader](C:/Users/91842/Downloads/questions-main/questions-main/src/infrastructure/json/repositories.ts:21), [validator](C:/Users/91842/Downloads/questions-main/questions-main/src/application/content-validation.ts:38), [schema probes](C:/Users/91842/Downloads/questions-main/questions-main/reports/production-audit-evidence-2026-10-01/schema-results.json).

### R4 — Make deployment provenance cover behavior-changing content

**Priority: Medium · Reproduced checksum omission**

The content checksum omits category age-gate/mature/child-safe/mixed-game flags, some descriptive fields, and blog content. Changing the Kids age-gate flag left the checksum unchanged in the fixture probe. The Git revision remains useful provenance, but the checksum cannot establish that all content affecting runtime behavior matches.

**Improve:** Hash a canonical serialized representation of all public content and behavior flags, including blog publication/content if the checksum is described as site-wide. Avoid delimiter ambiguity. Document exactly what is covered and assert that meaningful changes alter the hash.

Evidence: [checksum inputs](C:/Users/91842/Downloads/questions-main/questions-main/src/application/manifest-service.ts:12), schema probe evidence above.

### R5 — Restore focus after removing a favorite

**Priority: Medium · Reproduced keyboard issue**

Removing a focused favorite rerenders the entire list with `replaceChildren`. The focused button disappears and focus falls to `BODY`. A keyboard user then loses their place in the saved list.

**Improve:** Update the affected card locally or explicitly move focus to the next/previous card’s Remove button. For the last item or Clear All, focus an appropriate heading/empty-state action and announce the result once. Test keyboard removal at the first, middle, and last positions.

Evidence: [Favorites rendering](C:/Users/91842/Downloads/questions-main/questions-main/src/scripts/favorites-page.ts:137), browser evidence below.

### R6 — Make the Favorites capacity explicit

**Priority: Medium when the corpus grows · Reproduced fixture behavior**

Favorites is capped at 100 IDs. Saving item 101 silently drops the oldest saved item and returns success. This cannot currently occur using only the 55 published questions, but it becomes user-visible as the corpus grows.

**Improve:** Show the limit and refuse an extra save with a clear message, or explain any eviction and offer management/export. Consider versioned JSON import/export for users who want to back up local-only Favorites or move them to another device. The local-only storage model itself is reasonable for this product.

Evidence: [capacity/save logic](C:/Users/91842/Downloads/questions-main/questions-main/src/lib/favorites.ts:4), [save truncation](C:/Users/91842/Downloads/questions-main/questions-main/src/lib/favorites.ts:119), schema probe evidence above.

### R7 — Reduce unnecessary Favorites fetching and add a catalog budget

**Priority: Low now; Medium with a large corpus · Source verified**

Every render loads the full published catalog before resolving saved IDs, including an empty saved list. Initialization, `pageshow`, every storage event, and removals can trigger more work; storage events are not filtered by key. The current compressed catalog is only about 4 KiB, so this is not a present performance emergency. Its cost grows with the entire corpus rather than the user’s saved collection.

**Improve:** Share an in-flight/cached request during a visit, rerender local removals from the existing catalog, filter storage events, and avoid a catalog request for the obvious empty state. Preserve appropriate refresh/reconciliation when content changes. Add a catalog size budget; introduce shards or an ID lookup only when measurement justifies it.

Evidence: [render/events](C:/Users/91842/Downloads/questions-main/questions-main/src/scripts/favorites-page.ts:110), [catalog generation](C:/Users/91842/Downloads/questions-main/questions-main/src/application/favorites-catalog.ts).

### R8 — Make build-time publishing behavior operationally explicit

**Priority: Low · Static architecture consequence**

Scheduled blog publication, seasonal visibility, content edits, and the footer year depend on a rebuild. A date passing does not update existing static output on its own.

**Improve:** Document which events require a rebuild, define a release/content review process, and schedule builds if automatic date-based publication is desired. Keep a backup/source history for content. The downloaded workspace has no Git repository, so a hosted repository and branch protections still need to be established for the supplied CI workflows to operate.

Evidence: [blog publication helper](C:/Users/91842/Downloads/questions-main/questions-main/src/lib/blog-publication.ts), [seasonal links](C:/Users/91842/Downloads/questions-main/questions-main/src/components/SeasonalLinks.astro), [publishing documentation](C:/Users/91842/Downloads/questions-main/questions-main/docs/BLOG_PUBLISHING.md).

## UI and UX improvements

### U1 — Explain Favorites when JavaScript is unavailable

**Priority: Medium · Reproduced**

With JavaScript disabled, `/favorites/` stays at “Loading saved questions…” and Favorites Play stays at “Loading your saved questions…”. The normal game provides a useful `noscript` explanation, but the Favorites mode hides its game stage, including that explanation.

**Improve:** Add a visible `noscript` message explaining that browser-local Favorites requires JavaScript, with a link to the static question lists. Present a similar actionable state when required scripts fail to initialize.

Evidence: [Favorites page](C:/Users/91842/Downloads/questions-main/questions-main/src/pages/favorites/index.astro:32), [Favorites Play](C:/Users/91842/Downloads/questions-main/questions-main/src/pages/favorites/play/index.astro), [no-JS results](C:/Users/91842/Downloads/questions-main/questions-main/reports/production-audit-evidence-2026-10-01/final-browser-results.json).

### U2 — Review animation and milestone interruption

**Priority: Low · UX tradeoff, not a confirmed functional failure**

Question transitions take about 950ms and percentage counting about 900ms. Milestone overlays appear during play, dismiss after 2.5 seconds, and advance to another question. This can interrupt a conversation about the result and impose repeated waiting. Reduced-motion handling is already present and is worth retaining.

**Improve:** User-test shorter transitions, around 200–350ms where appropriate, and consider a nonblocking milestone toast or an explicit Continue action. Keep the result until the player requests the next question. Measure this with real users before changing an intentional product behavior.

Evidence: [transition](C:/Users/91842/Downloads/questions-main/questions-main/src/scripts/game.ts:566), [result animation](C:/Users/91842/Downloads/questions-main/questions-main/src/scripts/game-results.ts:66), [milestone](C:/Users/91842/Downloads/questions-main/questions-main/src/scripts/game-milestone.ts:108).

### U3 — Refine tablet navigation and typography

**Priority: Low · Visual observation**

The home page had no document-wide horizontal overflow at widths 320–1440px. Around 820px the desktop navigation is tight and About/Contact wrap; the rightmost button sits close to the viewport edge. The production typeface is strongly condensed and some mono metadata is small. These are readability/design considerations rather than established breakages.

**Improve:** Keep the collapsed menu slightly longer or simplify tablet navigation. Review heading density, small metadata, line-height, and weight using production fonts. Test 200%/400% browser zoom, narrow landscape, and long/unbroken option text. A 390px 200-character option probe and a home root-text-resize probe did not produce horizontal overflow; they do not replace full zoom testing.

Evidence: [tablet screenshot](C:/Users/91842/Downloads/questions-main/questions-main/reports/production-audit-evidence-2026-10-01/home-820.png), [long-option screenshot](C:/Users/91842/Downloads/questions-main/questions-main/reports/production-audit-evidence-2026-10-01/play-long-options-mobile.png), [responsive rules](C:/Users/91842/Downloads/questions-main/questions-main/src/styles/handoff.css:1145).

### U4 — Make play actions lead directly to play and clarify local persistence

**Priority: Low · Source review**

Some “play”/return calls to action lead to the home page rather than `/play/`, requiring another step or scrolling. The privacy copy’s remembered-pack claim differs from current storage behavior. Favorites correctly explains that saves live on this device, but users cannot currently transfer them.

**Improve:** Use the direct game route consistently for actions promising immediate play. Decide whether pack choice should persist, then align behavior and copy. Keep the local-only Favorites explanation visible, and consider a count in the navbar or Save controls on question lists if user testing shows people miss saving outside the game.

Evidence: [article actions](C:/Users/91842/Downloads/questions-main/questions-main/src/pages/blog/[slug].astro), [404 actions](C:/Users/91842/Downloads/questions-main/questions-main/src/pages/404.astro), [Favorites empty state](C:/Users/91842/Downloads/questions-main/questions-main/src/pages/favorites/index.astro), [Header](C:/Users/91842/Downloads/questions-main/questions-main/src/components/Header.astro).

## Performance and scalability

### P1 — Optimize fonts before adding more client-side complexity

**Priority: Medium opportunity · Measured payload**

The 128.5 KiB Bricolage file is the dominant individual core asset. Combined fonts are just below the current 150 KiB raw budget. Self-hosted WOFF2, included licenses, and `font-display: swap` are good choices. There is no critical-font preload or metric-adjusted fallback. Some styling requests weights beyond the declared 400–800 range, potentially relying on font synthesis.

**Improve:** Verify the actual font’s axes and glyph requirements, then compare a Latin/axis subset or smaller static font against the current design. Respect the licenses. Match the requested weights to the supplied font. Consider preloading only the truly critical face and using fallback metric adjustments after measuring their effect. Do not preload every font by default. Keep testing cold-cache mobile LCP and layout shift with production typography.

Lighthouse also identified render-blocking shared CSS. Its estimated savings are opportunities, not proven gains. The current scores and zero TBT do not justify rewriting the application framework.

Evidence: [font declarations](C:/Users/91842/Downloads/questions-main/questions-main/src/styles/handoff.css:3), [font files](C:/Users/91842/Downloads/questions-main/questions-main/public/fonts), Lighthouse evidence below. Binary font axis/subset inspection was not completed in this audit.

### P2 — Consolidate the two global styling layers

**Priority: Medium for maintenance; Low for current transfer size**

`global.css` and `handoff.css` together contain about 3,700 lines and 70 KiB of source styling. The later layer overrides many earlier tokens, colors, component rules, and responsive rules. Shared prose pages also receive game styles. This increases the effort and regression risk of future changes even though emitted gzip CSS is only 15 KiB.

**Improve:** Consolidate design tokens and component ownership, remove superseded rules after visual verification, and consider page-specific game/Favorites styles if profiling shows a benefit. Avoid a broad CSS rewrite before fixing the release tests and agreeing on the intended visual baselines.

Evidence: [base styles](C:/Users/91842/Downloads/questions-main/questions-main/src/styles/global.css), [override styles](C:/Users/91842/Downloads/questions-main/questions-main/src/styles/handoff.css).

### P3 — Document the mixed-game cap and watch engine growth

**Priority: Low now; Medium as content expands · Source verified**

Mixed mode is capped at 10 packs × 40 questions = **400 questions**. The same build-generated subset serves visitors until another build. Above that size, Mixed does not expose the entire eligible corpus. Category mode keeps fetched questions in memory, and the seen-ID in-memory set is not capped even though only the last 2,000 IDs are persisted. Selection repeatedly filters the accumulated pool.

**Improve:** Decide whether the 400-question cap is an editorial feature or an implementation limit. If breadth matters, rotate/stratify the mixed selection or lazily expose additional packs. Benchmark categories at 1,000/10,000 questions before introducing more complex structures; consider bounded caches and an unseen-question queue if needed. The current 55-question corpus is comfortably small.

Evidence: [pack limits](C:/Users/91842/Downloads/questions-main/questions-main/src/config/site.ts:62), [mixed truncation](C:/Users/91842/Downloads/questions-main/questions-main/src/application/game-data-service.ts:67), [pool/seen handling](C:/Users/91842/Downloads/questions-main/questions-main/src/scripts/game-engine.ts:25).

### P4 — Expand performance budgets to the assets and pages that can grow

**Priority: Low · Coverage gap**

The existing budgets are useful, but the Favorites catalog, social/article images, all prose/blog pages, and paginated category output are not equally covered. HTML ceilings are generous relative to the current pages. CI Lighthouse is warning-only, allowed to fail, and measures a demo build with one run.

**Improve:** Add catalog/image budgets, representative production route budgets, and repeated Lighthouse sampling with an agreed regression tolerance. Distinguish total emitted JS from the scripts loaded on a specific page. Make only stable, meaningful checks block releases; avoid an unnecessarily fragile performance gate.

Evidence: [budget tool](C:/Users/91842/Downloads/questions-main/questions-main/tools/performance-budget.ts), [CI Lighthouse job](C:/Users/91842/Downloads/questions-main/questions-main/.github/workflows/ci.yml:42).

## Security, privacy, and inactive integrations

### S1 — Complete mature-content gating before publishing restricted packs

**Priority: High before restricted content; inactive today · Source verified**

The pack picker consults `requiresAgeGate`, but category pages and share pages server-render question text immediately. The home page can include published mature categories/editor picks. Favorites renders saved text before the Open action’s confirmation. Thus local confirmation in the picker does not cover all routes that can display a restricted question. `isMature` and `requiresAgeGate` are separate flags; the intended policy needs to distinguish them.

**Improve:** Define which content needs confirmation and apply that rule consistently before display across home, category, share, Favorites, and game entry points. Exclude restricted questions from general-audience previews. Update the privacy statement to describe the actual policy. Static public JSON and a browser confirmation are not secure age verification or confidential access control; choose a different delivery model if stronger restrictions are required.

There is no current mature-question exposure because those files are empty. This item should block adding restricted content, rather than being represented as an active incident.

Evidence: [category rendering](C:/Users/91842/Downloads/questions-main/questions-main/src/pages/[...category]/index.astro), [share rendering](C:/Users/91842/Downloads/questions-main/questions-main/src/pages/s/[code].astro), [Favorites card](C:/Users/91842/Downloads/questions-main/questions-main/src/scripts/favorites-page.ts:39), [picker flags](C:/Users/91842/Downloads/questions-main/questions-main/src/components/Game.astro:384).

### S2 — Advertising is a scaffold, not a launch-ready integration

**Priority: High before enabling ads; inactive today · Source verified**

The ad component still uses `REPLACE_WITH_SLOT_ID_...`. It outputs fixed-size units, including desktop dimensions unsuitable for small screens. The stated lazy loading is represented by attributes, but there is no completed ad script/bootstrap/push implementation in the reviewed code. Storing an advertising consent choice alone does not make the integration complete.

**Improve:** Keep the flag off until real slots, responsive sizing, consent-controlled loading, lazy behavior, provider verification, and CSP/network testing are complete. Test consent rejection, withdrawal, repeated navigation, blocked scripts, and ad-related layout shift. For affected Google advertising regions/audiences, verify Google’s current certified CMP requirements; the custom banner should not be assumed sufficient. See [Google’s CMP requirements](https://support.google.com/adsense/answer/13554116?hl=en).

Evidence: [AdSlot](C:/Users/91842/Downloads/questions-main/questions-main/src/components/AdSlot.astro:25), [ad configuration](C:/Users/91842/Downloads/questions-main/questions-main/src/config/site.ts), [consent client](C:/Users/91842/Downloads/questions-main/questions-main/src/scripts/consent.ts).

### S3 — Use correct Web Vitals aggregation and real operational monitoring

**Priority: Medium before relying on analytics · Source verified**

The analytics observer labels individual layout-shift entries as CLS and individual slow event durations as INP. These are not the standard page-level metrics. CLS uses session-window aggregation; INP aggregates interactions, rather than treating each event as a final metric. LCP should also be finalized according to visibility/lifecycle behavior. With analytics disabled, browser errors have no active remote destination in this setup.

**Improve:** Use a maintained Web Vitals implementation or implement its actual aggregation semantics. Separate performance telemetry from operational errors. Add an uptime check and actionable alerts for health/page/asset failures, and define a privacy-appropriate error reporting policy. Do not assume the health endpoint itself sends alerts.

Sources: [CLS definition](https://web.dev/articles/cls), [INP definition](https://web.dev/articles/inp). Code: [analytics observer](C:/Users/91842/Downloads/questions-main/questions-main/src/scripts/analytics.ts:99), [health endpoint](C:/Users/91842/Downloads/questions-main/questions-main/src/pages/api/health.ts).

### S4 — Tighten spreadsheet export safety and multi-file import recovery

**Priority: Medium for untrusted editorial data; Low for current trusted content**

CSV escaping quotes delimiters but does not neutralize formula-leading cells such as `=`, `+`, `-`, or `@`. If future externally supplied questions are exported and opened in a spreadsheet, formulas may be interpreted. This concerns local editorial tooling, not a browser execution exploit on the current site.

The importer stages writes and renames each JSON file, which is safer than direct overwrite. A multi-file batch is not a single transaction: if a later rename fails, earlier files can remain changed.

**Improve:** Provide a spreadsheet-safe CSV mode with tested round trips, and preserve raw JSON for exact data exports. Add a recoverable backup or transaction journal for multi-file imports, plus dry-run/format checks. Keep moderation and validation before publication.

Evidence: [CSV cell writer](C:/Users/91842/Downloads/questions-main/questions-main/tools/export-questions.ts:31), [staged renames](C:/Users/91842/Downloads/questions-main/questions-main/tools/import-csv.ts:250).

### S5 — Verify the final host and minimize unnecessary third-party permissions

**Priority: Medium · Configuration/live-environment check**

Canonical origin is configurable at build time, robots has a static sitemap origin, custom Cloudflare routes are commented, and `workers_dev` is enabled. The noindex header rule targets versioned preview hosts; it does not establish that every alternate unversioned host is excluded from indexing. Static pages are emitted at build time, so changing only runtime variables does not rebuild their metadata or feature flags.

The CSP already has useful restrictions, including blocked framing, objects, base changes, and form submission. It permits analytics/advertising script origins even with those features off, broad HTTPS images, and inline styles. Those are hardening opportunities, not a confirmed exploit. Enabling third parties can require additional verified CSP endpoints.

**Improve:** Set one production origin during the build, align robots/sitemap/canonicals, verify apex/www redirects, and disable or noindex alternate public hosts deliberately. Review allowed CSP sources against the enabled features. Check API headers separately from asset headers: Cloudflare `_headers` applies to static asset responses, while Worker-generated responses need middleware. See [Cloudflare asset-header documentation](https://developers.cloudflare.com/workers/static-assets/headers/).

Evidence: [origin/sitemap constants](C:/Users/91842/Downloads/questions-main/questions-main/src/config/site-static.mjs:10), [robots](C:/Users/91842/Downloads/questions-main/questions-main/public/robots.txt), [Wrangler config](C:/Users/91842/Downloads/questions-main/questions-main/wrangler.jsonc), [static headers](C:/Users/91842/Downloads/questions-main/questions-main/public/_headers), [API middleware](C:/Users/91842/Downloads/questions-main/questions-main/src/middleware.ts).

## SEO, sharing, and media

### E1 — Remove noindex utility pages from the sitemap

**Priority: Medium · Verified generated output**

`/favorites/` and `/favorites/play/` declare noindex but appear in the sitemap. They are device-specific utility pages rather than useful search landing pages. Share pages are correctly excluded and noindexed.

**Improve:** Align sitemap inclusion with indexability and exclude personal utility routes. If the blog ever becomes empty/noindex, exclude it conditionally too. Only populate meaningful modification dates; uniform priority/change frequency values are not a ranking strategy. Google advises listing URLs intended for indexing: [sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).

Evidence: [sitemap filter](C:/Users/91842/Downloads/questions-main/questions-main/src/config/site-static.mjs:15), [Favorites metadata](C:/Users/91842/Downloads/questions-main/questions-main/src/pages/favorites/index.astro), generated sitemap recorded in browser evidence.

### E2 — Improve contextual share metadata and future article images

**Priority: Low · Verified metadata; future image risk**

The 55 share-page titles are 104–170 characters; 34 descriptions exceed 170 characters. These pages are noindexed, so the immediate issue is social-preview truncation/readability, not an assumed search-ranking penalty. Every question uses the same default social image. There is no universal character count that guarantees a Google title will display fully.

Article/card images have width/height reservations and alt-text validation, which are good. They use plain images without responsive renditions, and the schema checks the path prefix rather than whether the image exists. Current published content does not expose a missing article image; the risk appears when more media is added.

**Improve:** Write concise contextual sharing metadata, test real link previews, and consider per-question/category social images if useful. Add build-time image existence checks and an optimized responsive image pipeline when articles start using large media. Keep explicit dimensions and meaningful alt text.

Evidence: [share page](C:/Users/91842/Downloads/questions-main/questions-main/src/pages/s/[code].astro), [blog image schema](C:/Users/91842/Downloads/questions-main/questions-main/src/content.config.ts:22), [blog card](C:/Users/91842/Downloads/questions-main/questions-main/src/components/BlogCard.astro:16), [article image](C:/Users/91842/Downloads/questions-main/questions-main/src/pages/blog/[slug].astro:146).

## Maintainability and release operations

### M1 — Align deployment tooling and make manual releases follow the same checks

**Priority: Medium · Verified version drift**

The installed lockfile resolves Wrangler 4.144.0, while the deployment action requests 4.129.0. Build/local validation and deployment therefore use different tool versions. The manual `npm run deploy` performs build/budgets but does not run the full lint/format/type/unit/browser gate.

**Improve:** Use a deliberate, consistent locked Wrangler version for build and deploy. Document manual release prerequisites or provide a release command that verifies them. Keep the existing SHA-pinned actions, limited default permissions, production environment, and exact-commit CI verification. Exercise rollback using the actual host and content packs.

Evidence: [deployment action](C:/Users/91842/Downloads/questions-main/questions-main/.github/workflows/deploy.yml:94), [package scripts](C:/Users/91842/Downloads/questions-main/questions-main/package.json), [rollback instructions](C:/Users/91842/Downloads/questions-main/questions-main/docs/ROLLBACK.md).

### M2 — Remove stale architecture/documentation after the release blockers

**Priority: Low · Source review**

There are leftover mock repository/fixture modules that are no longer used by the current JSON factory, older unused helpers/configuration fields, an unused blog `Props` hint, and documentation/TASKS statements referring to older demo/navigation states. Some deployment safety tests inspect source strings instead of exercising all relevant behavior.

**Improve:** Remove or clearly isolate unused fixtures and abandoned bindings after confirming references. Update README/TASKS to reflect the real content and development flow. Use behavior tests for validation, deployment provenance, cache recovery, and feature-gated integrations. Keep the existing domain/repository/service boundaries; they are sensible for this application.

Evidence: [repository factory](C:/Users/91842/Downloads/questions-main/questions-main/src/repositories/factory.ts), [mock modules](C:/Users/91842/Downloads/questions-main/questions-main/src/infrastructure/mock), [environment typings](C:/Users/91842/Downloads/questions-main/questions-main/src/env.d.ts), [tasks](C:/Users/91842/Downloads/questions-main/questions-main/TASKS.md), [deployment tests](C:/Users/91842/Downloads/questions-main/questions-main/tests/unit/deployment-safety.test.ts).

## What is worth keeping

- Static-first Astro delivery with very small client JavaScript. There is no reason to add a database or a heavy client framework merely to store this size of editorial content.
- File-backed JSON with stable IDs/share codes, draft filtering, deterministic pack generation, and hash-based pack caching.
- Existing duplicate/reversed-question checks, category relationship checks, child/mature conflict validation, and rejection of demo content in production builds.
- Local-only Favorites with versioned storage/migration and handling of unavailable browser storage. Removing unpublished favorites via the current published catalog is a useful integrity feature.
- Static question lists as a baseline, semantic headings, skip navigation, live announcements, and reduced-motion handling.
- Self-hosted WOFF2 fonts, font licenses, reserved image dimensions, and existing bundle budgets.
- Useful CSP and security headers, a very small dynamic endpoint surface, and no active third-party requests observed in the sampled production pages with integrations off.
- SHA-pinned CI actions, dependency audit gates, deployment verification metadata, and rollback documentation.

No backend auth, CSRF, database injection, payment, or file-upload subsystem currently exists to audit. Contact/submission flows open email rather than receiving form posts. Adding such features would create a new security scope; their absence keeps the present attack surface relatively small.

## Hosting acceptance checks still required

These checks need the final deployment and owner configuration. They were not represented as passed by this local audit.

1. **Repository/release:** Put the reviewed source in version control; configure branch protections, CI, deployment secrets with minimum permissions, and the production environment. Release the exact commit that passed the full gate.
2. **Origin/TLS:** Confirm domain ownership, DNS, certificates, one canonical host, apex/www redirects, and HTTPS behavior. Verify that all relevant subdomains support HTTPS before relying on the existing HSTS `includeSubDomains` policy; a `preload` header token alone does not establish preload-list enrollment.
3. **Deployed responses:** Check real HTML, CSS, JS, fonts, game manifest/packs, Favorites catalog, 404, API health, robots, and sitemap. Verify status codes, security headers, compression, cache lifetimes, content types, and alternate-host indexing policy.
4. **Deployment recovery:** Exercise old open tabs, a changed game-data deployment, rollback, and a stale manifest. Confirm that recovery does not loop on an unavailable hashed pack.
5. **Browsers/accessibility:** Use real iOS Safari plus Firefox, keyboard-only navigation, a screen reader, 200%/400% zoom, reduced motion, forced colors, small landscape, and worst-case option lengths. Include save/remove/clear, menu/dialog focus, share/copy failure, and milestone states.
6. **Faults:** Test blocked/local-full storage, malformed saved state, offline/slow requests, absent/invalid packs, script failure, and empty/unpublished saved questions. Display a useful recovery action without losing valid saved data on transient failures.
7. **Enabled integrations:** If ads or analytics are part of launch, complete their conditional findings first, test consent rejection/withdrawal, validate CSP with the actual providers, and remeasure LCP/CLS. A flag change alone is not acceptance.
8. **Operations:** Set uptime/error alerts, an owner/on-call destination, release/rollback ownership, content backups, and a rebuild/publication process. Verify the actual Cloudflare plan’s limits/cost assumptions and apply an appropriate edge protection policy to the public dynamic endpoint if needed.
9. **Email/content:** Verify the contact mailbox and domain email configuration without sending unsolicited messages; finalize owner policy details and review the launch questions/categories.
10. **Post-launch measurement:** Collect genuine field performance after enough traffic; compare mobile LCP/INP/CLS and error rates with the laboratory baseline. Run a modest availability/load smoke check on the deployed configuration.

## Suggested implementation order

1. **Release correctness:** Fix B1; choose the launch content scope in B4; finalize B2; then establish production-font testing in B6.
2. **Visitor clarity/accessibility:** Fix B3 and B5, plus Favorites focus and no-JS fallback in R5/U1.
3. **Reliability:** Add bounded fetches, stale-manifest recovery, stronger JSON validation, and complete provenance in R1–R4. Rehearse deployment and rollback.
4. **Hosting setup:** Complete the live acceptance checks. Keep ads and restricted packs off until their own gates are satisfied.
5. **Measured refinement:** Optimize fonts, consolidate CSS, improve animation/curation/share previews, and extend budgets as the corpus grows.

The first public release should require: all release checks green; no unresolved public placeholders; truthful content/result descriptions; corrected verified accessibility defects; and a successful real-host smoke/rollback check. The lower-priority scaling/design items can be scheduled without delaying a small, accurately described launch.

## Evidence files

The evidence folder contains generated audit output rather than application source. Browser reports include local URLs and the audit environment paths.

- [Functional browser results](C:/Users/91842/Downloads/questions-main/questions-main/reports/production-audit-evidence-2026-10-01/e2e-results.json)
- [Visual comparison results](C:/Users/91842/Downloads/questions-main/questions-main/reports/production-audit-evidence-2026-10-01/visual-results.json)
- [Accessibility scans](C:/Users/91842/Downloads/questions-main/questions-main/reports/production-audit-evidence-2026-10-01/accessibility-results.json)
- [Browser crawl, breakpoints, focus and network probes](C:/Users/91842/Downloads/questions-main/questions-main/reports/production-audit-evidence-2026-10-01/browser-summary.json)
- [Final game, long-text, text-resize and no-JS probes](C:/Users/91842/Downloads/questions-main/questions-main/reports/production-audit-evidence-2026-10-01/final-browser-results.json)
- [Schema, checksum and Favorites-limit probes](C:/Users/91842/Downloads/questions-main/questions-main/reports/production-audit-evidence-2026-10-01/schema-results.json)
- [npm advisory audit](C:/Users/91842/Downloads/questions-main/questions-main/reports/production-audit-evidence-2026-10-01/npm-audit.json)
- [Lighthouse summary](C:/Users/91842/Downloads/questions-main/questions-main/reports/production-audit-evidence-2026-10-01/lighthouse-summary.json), with four full Lighthouse JSON reports in the same folder
- [Source snapshot hashes](C:/Users/91842/Downloads/questions-main/questions-main/reports/production-audit-evidence-2026-10-01/source-snapshot.json)
- Screenshots: [mobile home](C:/Users/91842/Downloads/questions-main/questions-main/reports/production-audit-evidence-2026-10-01/home-390.png), [desktop home](C:/Users/91842/Downloads/questions-main/questions-main/reports/production-audit-evidence-2026-10-01/home-1440.png), tablet/game screenshots linked in findings
