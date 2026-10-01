import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

interface CatalogQuestion {
  id: string;
  a: string;
  b: string;
  s: string;
  g: boolean;
}

test('legacy game URL redirects permanently to the canonical game', async ({ request, page }) => {
  for (const path of ['/play', '/play/']) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(301);
    expect(new URL(response.headers().location!, response.url()).pathname).toBe(
      '/would-you-rather-questions-game/',
    );
  }
  await page.goto('/play/');
  await expect(page).toHaveURL(/\/would-you-rather-questions-game\/$/);
  await expect(page.locator('#choice-a')).toBeVisible();
  const sitemap = await request.get('/sitemap-0.xml');
  const xml = await sitemap.text();
  expect(xml).toContain('/would-you-rather-questions-game/</loc>');
  expect(xml).not.toContain('/play/</loc>');
});

async function publicCatalog(request: import('@playwright/test').APIRequestContext) {
  const response = await request.get('/game-data/favorites.json');
  expect(response.ok()).toBe(true);
  const payload = (await response.json()) as { q: CatalogQuestion[] };
  return payload.q;
}

test('redesigned home links, copy control, and play page work', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Would You Rather Questions', level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: /play the game/i }).first()).toHaveAttribute(
    'href',
    '/would-you-rather-questions-game/',
  );
  await expect(page.locator('.reference-game-preview')).toHaveAttribute(
    'href',
    '/would-you-rather-questions-game/',
  );
  await expect(page.locator('.reference-preview-choice')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );

  const copy = page.locator('#best .question-copy').first();
  const options = await copy.locator('xpath=preceding-sibling::p/strong').allTextContents();
  const expectedQuestion = `Would you rather ${options[0]} or ${options[1]}?`;
  await copy.click();
  await expect(copy).toHaveAttribute('aria-label', 'Copied');
  await expect(page.locator('.question-copy-toast')).toHaveText('Question copied to clipboard');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(expectedQuestion);

  await page.setViewportSize({ width: 360, height: 800 });
  const actionTops = await page
    .locator('.reference-hero-actions a')
    .evaluateAll((links) => links.map((link) => link.getBoundingClientRect().top));
  expect(actionTops).toHaveLength(2);
  expect(Math.abs(actionTops[0]! - actionTops[1]!)).toBeLessThan(2);

  await page.goto('/would-you-rather-questions-game/');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    /wouldyouratherquestions\.org\/would-you-rather-questions-game\/$/,
  );
  await page.locator('#choice-a').click();
  await expect(page.locator('#game-stage')).toHaveClass(/answered/);
  await expect(page.locator('#next-button')).toBeVisible();
});

test('home game shows stable local display results and advances', async ({ page }) => {
  const removedEndpoint = `/${['api', 'vote'].join('/')}/`;
  const removedEndpointRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === removedEndpoint) {
      removedEndpointRequests.push(request.url());
    }
  });

  await page.addInitScript(() => {
    localStorage.setItem('wyr_pack', 'for-couples');
  });

  const initialGameDataRequests: string[] = [];
  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.startsWith('/game-data/')) {
      initialGameDataRequests.push(pathname);
    }
  });

  await page.goto('/');

  const serverRenderedQuestionId = await page
    .locator('#game-stage')
    .getAttribute('data-question-id');

  expect(serverRenderedQuestionId).toBeTruthy();

  await page.waitForTimeout(500);

  expect(initialGameDataRequests).toEqual([]);
  await expect(page.locator('#game-stage')).toHaveAttribute(
    'data-question-id',
    serverRenderedQuestionId ?? '',
  );
  await expect(page.locator('#choice-a')).toBeEnabled();
  await expect(page.locator('#choice-b')).toBeEnabled();
  await expect(page.locator('#skip-button')).toBeEnabled();

  await expect(page.locator('#pack-label')).toHaveText('Mixed');
  expect(await page.evaluate(() => localStorage.getItem('wyr_pack'))).toBeNull();

  await expect(page).toHaveTitle(/Would You Rather Questions/);
  await expect(page.locator('main h1').first()).toContainText('Would You Rather Questions');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    /wouldyouratherquestions\.org\/$/,
  );
  await expect(page.locator('#choice-a')).toBeVisible();
  await expect(page.locator('#verdict-text')).toHaveCount(1);

  await page.locator('#pack-button').click();
  await expect(page.locator('#pack-dialog')).toBeVisible();
  await page.locator('#close-pack-dialog').click();

  await page.locator('#pack-button').click();
  await page.evaluate(() => {
    const picker = document.getElementById('pack-picker');
    const gate = document.getElementById('age-gate');
    if (picker) picker.hidden = true;
    if (gate) gate.hidden = false;
  });
  await expect(page.locator('#age-gate')).toBeVisible();

  await page.locator('#age-back-button').focus();
  await page.keyboard.press('Enter');

  await expect(page.locator('#pack-dialog')).toBeVisible();
  await expect(page.locator('#pack-picker')).toBeVisible();
  await page.locator('#close-pack-dialog').click();

  const firstQuestionId = await page.locator('#game-stage').getAttribute('data-question-id');
  await page.locator('#choice-a').click();
  await expect(page.locator('#game-stage')).toHaveClass(/answered/);
  await expect(page.locator('#game-stage')).toHaveAttribute('data-result-ready', '1');
  await expect(page.locator('#choice-a')).toHaveClass(/picked/);
  expect(
    await page.locator('#choice-b').evaluate((element) => element.classList.contains('picked')),
  ).toBe(false);
  await expect(page.locator('#choice-b')).toHaveClass(/not-picked/);
  const resultA = await page.locator('#percent-a').textContent();
  const resultB = await page.locator('#percent-b').textContent();
  expect(resultA).toMatch(/^\d+\.\d%$/);
  expect(resultB).toMatch(/^\d+\.\d%$/);

  await page.locator('#choice-b').click();
  await expect(page.locator('#choice-b')).toHaveClass(/picked/);
  expect(
    await page.locator('#choice-a').evaluate((element) => element.classList.contains('picked')),
  ).toBe(false);
  await expect(page.locator('#choice-a')).toHaveClass(/not-picked/);
  await expect(page.locator('#percent-a')).toHaveText(resultA ?? '');
  await expect(page.locator('#percent-b')).toHaveText(resultB ?? '');
  expect(removedEndpointRequests).toEqual([]);

  await page.locator('#next-button').click();
  await expect(page.locator('#game-stage')).not.toHaveClass(/answered/);
  await expect(page.locator('#game-stage')).not.toHaveAttribute(
    'data-question-id',
    firstQuestionId ?? '',
  );
});

test('game milestone counts unique answers and restores keyboard focus', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('wyr_completed_questions', '4');
  });

  await page.goto('/');

  const stage = page.locator('#game-stage');
  const choiceA = page.locator('#choice-a');
  const choiceB = page.locator('#choice-b');
  const milestone = page.locator('#game-milestone');
  const nextButton = page.locator('#next-button');

  await expect(stage).toHaveAttribute('data-entry-ready', '1');
  const fifthQuestionId = await stage.getAttribute('data-question-id');
  await choiceA.click();

  await expect(choiceA).toHaveAttribute('aria-pressed', 'true');
  await expect(choiceB).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#option-label-a')).toHaveText('YOUR CHOICE');
  await expect(milestone).toBeVisible();
  await expect(milestone).toBeFocused();
  await expect(milestone).toHaveAttribute('aria-label', '5 questions completed. Continue');

  await page.keyboard.press('Escape');
  await expect(milestone).toBeHidden();
  await expect(choiceA).toBeFocused();
  await expect(stage).not.toHaveAttribute('data-question-id', fifthQuestionId ?? '');
  await expect(stage).not.toHaveClass(/answered/);

  await choiceB.click();

  expect(await page.evaluate(() => sessionStorage.getItem('wyr_completed_questions'))).toBe('6');

  const answeredQuestionId = await stage.getAttribute('data-question-id');
  await nextButton.click();
  await expect(stage).not.toHaveAttribute('data-question-id', answeredQuestionId ?? '');

  const skippedQuestionId = await stage.getAttribute('data-question-id');
  await page.locator('#skip-button').click();
  await expect(stage).not.toHaveAttribute('data-question-id', skippedQuestionId ?? '');

  expect(await page.evaluate(() => sessionStorage.getItem('wyr_completed_questions'))).toBe('6');
});

test('milestone tap and automatic dismissal reveal the next question', async ({ page }) => {
  await page.goto('/would-you-rather-questions-game/');
  const stage = page.locator('#game-stage');
  const milestone = page.locator('#game-milestone');

  for (const [count, dismiss] of [
    ['4', 'tap'],
    ['19', 'timer'],
  ] as const) {
    await page.evaluate((value) => sessionStorage.setItem('wyr_completed_questions', value), count);
    await page.reload();
    const answeredId = await stage.getAttribute('data-question-id');
    await page.locator('#choice-a').click();
    await expect(milestone).toBeVisible();
    if (dismiss === 'tap') await milestone.click();
    await expect(milestone).toBeHidden({ timeout: 10_000 });
    await expect(stage).not.toHaveAttribute('data-question-id', answeredId ?? '');
    await expect(stage).not.toHaveClass(/answered/);
  }
});

test('single question page does not render a next button', async ({ page, request }) => {
  const question = (await publicCatalog(request)).find((item) => !item.g);
  expect(question).toBeDefined();
  await page.goto(`/s/${question!.s}/`);

  await expect(page.locator('#choice-a')).toBeVisible();
  await expect(page.locator('#next-button')).toHaveCount(0);
});

test('mobile hamburger opens, closes, and resets reliably', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const menuButton = page.locator('#menu-button');
  const navLinks = page.locator('#nav-links');
  const navScrim = page.locator('#nav-scrim');
  const categoryButton = page.locator('#category-button');
  const categoryMenu = page.locator('#category-menu');

  await menuButton.click();
  await expect(navLinks).toBeVisible();
  const menuBounds = await navLinks.boundingBox();
  expect(menuBounds?.x).toBe(0);
  expect(menuBounds?.width).toBe(390);
  await expect(navScrim).toBeVisible();
  await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
  await expect(menuButton).toHaveAttribute('aria-label', 'Close menu');
  expect(await page.locator('body').evaluate((body) => getComputedStyle(body).overflow)).toBe(
    'hidden',
  );

  await categoryButton.click();
  await expect(categoryButton).toHaveAttribute('aria-expanded', 'true');
  await expect(categoryMenu).toBeVisible();
  await categoryButton.click();
  await expect(categoryButton).toHaveAttribute('aria-expanded', 'false');
  await expect(categoryMenu).toBeHidden();
  await categoryButton.click();
  await expect(categoryMenu).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(categoryMenu).toBeHidden();
  await expect(navLinks).toBeHidden();
  await expect(navScrim).toBeHidden();
  await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
  await expect(menuButton).toHaveAttribute('aria-label', 'Open menu');
  await expect(menuButton).toBeFocused();
  expect(await page.locator('body').evaluate((body) => getComputedStyle(body).overflow)).not.toBe(
    'hidden',
  );

  await menuButton.click();
  await menuButton.click();
  await expect(navLinks).toBeHidden();

  await menuButton.click();
  const scrimBounds = await navScrim.boundingBox();
  expect(scrimBounds).not.toBeNull();
  await navScrim.click({ position: { x: 5, y: scrimBounds!.height - 5 } });
  await expect(navLinks).toBeHidden();

  await menuButton.click();
  await page.setViewportSize({ width: 801, height: 844 });
  await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
  await expect(menuButton).toHaveAttribute('aria-label', 'Open menu');
  await expect(navLinks).not.toHaveClass(/open/);
  await expect(navScrim).not.toHaveClass(/open/);
  expect(await page.locator('body').evaluate((body) => getComputedStyle(body).overflow)).not.toBe(
    'hidden',
  );

  for (const path of ['/funny-would-you-rather-questions/', '/about-us/']) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path);
    await page.locator('#menu-button').click();
    await expect(page.locator('#nav-links')).toBeVisible();
    const bounds = await page.locator('#nav-scrim').boundingBox();
    expect(bounds).not.toBeNull();
    await page.locator('#nav-scrim').click({ position: { x: 5, y: bounds!.height - 5 } });
    await expect(page.locator('#nav-links')).toBeHidden();
  }

  for (const [selector, destination] of [
    ['#nav-links a[href="/about-us/"]', /about-us\/$/],
    ['#nav-links a[href="/contact-us/"]', /contact-us\/$/],
    ['#nav-links a[href="/submit-a-question/"]', /submit-a-question\/$/],
  ] as const) {
    await page.goto('/');
    await page.setViewportSize({ width: 390, height: 844 });
    await menuButton.click();
    await page.locator(selector).click();
    await expect(page).toHaveURL(destination);
    await expect(page.locator('#menu-button')).toHaveAttribute('aria-expanded', 'false');
  }

  await page.goto('/');
  await page.setViewportSize({ width: 390, height: 844 });
  await menuButton.click();
  await categoryButton.click();
  const categoryLink = page.locator('#category-menu a').first();
  const categoryUrl = new URL((await categoryLink.getAttribute('href'))!, page.url()).href;
  await categoryLink.click();
  await expect(page).toHaveURL(categoryUrl);
  await expect(page.locator('#menu-button')).toHaveAttribute('aria-expanded', 'false');
});

test('contact and question suggestion pages offer email links', async ({ page }) => {
  await page.goto('/contact-us/');
  const contactLink = page.locator('#contact-email-link');
  await expect(contactLink).toHaveAttribute(
    'href',
    /^mailto:hello@wouldyouratherquestions\.org\?subject=/,
  );
  await expect(page.locator('form')).toHaveCount(0);

  await page.goto('/submit-a-question/');
  const submissionLink = page.locator('#submission-email-link');
  const href = await submissionLink.getAttribute('href');
  expect(href).toMatch(/^mailto:hello@wouldyouratherquestions\.org\?subject=/);
  const emailUrl = new URL(href ?? '');
  expect(emailUrl.searchParams.get('body')).toContain('Option A:');
  expect(emailUrl.searchParams.get('body')).toContain('Option B:');
  expect(emailUrl.searchParams.get('body')).toContain('Suggested category:');
  await expect(page.locator('form')).toHaveCount(0);
});

test('support pages and 404 render without blank states', async ({ page }) => {
  for (const path of [
    '/contact-us/',
    '/submit-a-question/',
    '/privacy-policy/',
    '/terms-and-conditions/',
  ]) {
    await page.goto(path);
    await expect(page.locator('main h1')).toBeVisible();
    await expect(page.locator('footer')).toBeVisible();

    const documentTitle = await page.title();
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      'content',
      documentTitle,
    );
    await expect(page.locator('meta[name="twitter:title"]')).toHaveAttribute(
      'content',
      documentTitle,
    );
  }
  await page.goto('/404.html');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Page not found');
});

test('home question remains stable after reload and browser history restoration', async ({
  page,
}) => {
  await page.goto('/');

  const stage = page.locator('#game-stage');
  await expect(stage).toHaveAttribute('data-entry-ready', '1');

  const firstQuestionId = await stage.getAttribute('data-question-id');
  expect(firstQuestionId).toBeTruthy();

  await page.reload();
  await expect(stage).toHaveAttribute('data-entry-ready', '1');
  await expect(stage).toHaveAttribute('data-question-id', firstQuestionId ?? '');

  const reloadedQuestionId = await stage.getAttribute('data-question-id');
  expect(reloadedQuestionId).toBe(firstQuestionId);

  await page.goto('/categories/');
  await page.goBack();

  await expect(page).toHaveURL(/\/$/);
  await expect(stage).toHaveAttribute('data-entry-ready', '1');
  await expect(stage).toHaveAttribute('data-question-id', reloadedQuestionId ?? '');

  const restoredQuestionId = await stage.getAttribute('data-question-id');
  expect(restoredQuestionId).toBe(reloadedQuestionId);
});

test('game question can be saved and removed using ID-only storage', async ({ page }) => {
  await page.goto('/');

  const favoriteButton = page.locator('#favorite-button');
  await expect(favoriteButton).toBeVisible();
  await expect(favoriteButton).toHaveAttribute('aria-pressed', 'false');
  await expect(favoriteButton).toHaveAttribute('aria-label', 'Save this question to favorites');

  const questionId = await page.locator('#game-stage').getAttribute('data-question-id');
  expect(questionId).toBeTruthy();

  await favoriteButton.click();
  await expect(favoriteButton).toHaveAttribute('aria-pressed', 'true');
  await expect(favoriteButton).toHaveAttribute('aria-label', 'Remove this question from favorites');

  const saved = await page.evaluate(() => {
    const raw = localStorage.getItem('wyr_favorites');
    return raw ? (JSON.parse(raw) as { v: number; ids: string[] }) : null;
  });

  expect(saved).toEqual({
    v: 2,
    ids: [questionId],
  });

  await page.reload();
  await expect(page.locator('#game-stage')).toHaveAttribute('data-entry-ready', '1');

  const persisted = await page.evaluate((id) => {
    const raw = localStorage.getItem('wyr_favorites');
    if (!raw) return false;

    const payload = JSON.parse(raw) as { v: number; ids: string[] };
    return payload.v === 2 && payload.ids.includes(id);
  }, questionId!);

  expect(persisted).toBe(true);

  const menuButton = page.getByRole('button', { name: 'Open menu' });
  if (await menuButton.isVisible()) await menuButton.click();
  const favoritesLink = page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', {
      name: 'Favorites',
      exact: true,
    });
  await expect(favoritesLink).toBeVisible();
  await favoritesLink.click();
  await expect(page).toHaveURL(/\/favorites\/$/);
  await expect(page.locator('#favorites-count')).toHaveText('1 saved question');
  await expect(page.locator('#favorite-list .favorite-card')).toHaveCount(1);

  await page.locator('.favorite-card-actions button').click();
  await expect(page.locator('#favorites-count')).toHaveText('0 saved questions');
  await expect(page.locator('#favorites-empty')).toBeVisible();
  await expect(page.locator('#favorites-heading')).toBeFocused();

  const remaining = await page.evaluate(() => {
    const raw = localStorage.getItem('wyr_favorites');
    return raw ? (JSON.parse(raw) as { ids: string[] }).ids.length : 0;
  });

  expect(remaining).toBe(0);
});

test('favorites migrate, reconcile, and play from the current catalog', async ({
  page,
  request,
}) => {
  const [first, second] = (await publicCatalog(request)).filter((item) => !item.g);
  expect(first).toBeDefined();
  expect(second).toBeDefined();
  const firstId = first!.id;
  const secondId = second!.id;
  const unavailableId = '99999999-9999-4999-8999-999999999999';

  await page.addInitScript(
    ({ firstId, secondId, unavailableId }) => {
      localStorage.setItem(
        'wyr_favorites',
        JSON.stringify({
          v: 1,
          questions: [
            {
              id: firstId,
              a: 'stale option A',
              b: 'stale option B',
              s: 'oldcode1',
            },
            {
              id: secondId,
              a: 'another stale option A',
              b: 'another stale option B',
              s: 'oldcode2',
            },
            {
              id: unavailableId,
              a: 'deleted question A',
              b: 'deleted question B',
              s: 'deleted1',
            },
          ],
        }),
      );
    },
    { firstId, secondId, unavailableId },
  );

  const manifestRequests: string[] = [];
  const packRequests: string[] = [];

  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname;

    if (pathname === '/game-data/manifest.json') {
      manifestRequests.push(request.url());
    }

    if (pathname.includes('/game-data/packs/')) {
      packRequests.push(request.url());
    }
  });

  await page.goto('/favorites/');

  await expect(page.locator('#favorites-count')).toHaveText('2 saved questions');
  await expect(page.locator('#favorite-list .favorite-card')).toHaveCount(2);
  await expect(page.locator('#favorite-list')).toContainText(first!.a);
  await expect(page.locator('#favorite-list')).toContainText(second!.a);
  await expect(page.locator('#favorite-list')).not.toContainText('stale option');
  await expect(page.locator('#play-favorites')).toBeVisible();

  const migrated = await page.evaluate(() => {
    const raw = localStorage.getItem('wyr_favorites');
    return raw ? (JSON.parse(raw) as { v: number; ids: string[] }) : null;
  });

  expect(migrated).toEqual({
    v: 2,
    ids: [firstId, secondId],
  });

  await page.locator('#play-favorites').click();
  await expect(page).toHaveURL(/\/favorites\/play\/$/);
  await expect(page.locator('#game-stage')).toBeVisible();

  const playedFirstId = await page.locator('#game-stage').getAttribute('data-question-id');
  expect([firstId, secondId]).toContain(playedFirstId);
  await expect(page.locator('#favorite-button')).toHaveAttribute('aria-pressed', 'true');

  await page.locator('#choice-a').click();
  await page.locator('#next-button').click();

  await expect(page.locator('#game-stage')).not.toHaveAttribute(
    'data-question-id',
    playedFirstId ?? '',
  );

  await page.locator('#choice-b').click();
  await page.locator('#next-button').click();

  await expect(page.locator('#verdict-text')).toHaveText(
    'You have played every saved question. Nice work.',
  );
  await expect(page.locator('#next-label')).toHaveText('Play again');

  await page.locator('#next-button').click();
  await expect(page.locator('#next-label')).toHaveText('Next question');
  expect([firstId, secondId]).toContain(
    await page.locator('#game-stage').getAttribute('data-question-id'),
  );

  expect(manifestRequests).toEqual([]);
  expect(packRequests).toEqual([]);

  await page.goto('/favorites/');
  await expect(page.locator('#favorites-count')).toHaveText('2 saved questions');

  await page.locator('.favorite-card-actions button').first().click();
  await expect(page.locator('#favorites-count')).toHaveText('1 saved question');

  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#clear-favorites').click();

  await expect(page.locator('#favorites-count')).toHaveText('0 saved questions');
  await expect(page.locator('#favorites-empty')).toBeVisible();
  await expect(page.locator('#favorite-list')).toBeHidden();
});

test('blog listing and article expose expected SEO metadata', async ({ page }) => {
  await page.goto('/blog/');

  await expect(page).toHaveTitle(/Blog.*Would You Rather Questions/);
  await expect(page.locator('main h1')).toHaveText('The Would You Rather Blog');

  const articleLink = page.locator('.blog-card-link[href="/blog/how-to-play-would-you-rather/"]');

  await expect(articleLink).toBeVisible();
  await expect(
    articleLink.getByRole('heading', {
      name: 'How to Play Would You Rather',
    }),
  ).toBeVisible();

  await expect(page.locator('#nav-links a[href="/blog/"]')).toHaveCount(1);
  await expect(page.locator('#site-footer a[href="/blog/"]')).toHaveCount(1);

  await page.goto('/blog/how-to-play-would-you-rather/');

  await expect(page).toHaveTitle(/How to Play Would You Rather/);
  await expect(page.locator('main h1')).toHaveText('How to Play Would You Rather');

  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    /wouldyouratherquestions\.org\/blog\/how-to-play-would-you-rather\/$/,
  );

  const structuredData = await page.locator('script[type="application/ld+json"]').allTextContents();

  const blogPosting = structuredData
    .map(
      (block) =>
        JSON.parse(block) as {
          '@type'?: string;
          headline?: string;
          datePublished?: string;
        },
    )
    .find((block) => block['@type'] === 'BlogPosting');

  expect(blogPosting).toMatchObject({
    '@type': 'BlogPosting',
    headline: 'How to Play Would You Rather',
  });
  expect(blogPosting?.datePublished).toMatch(/^2026-09-22T/);

  const tableOfContentsLink = page.locator('a[href="#what-you-need-to-play"]').first();

  await expect(tableOfContentsLink).toHaveAttribute('href', '#what-you-need-to-play');
  await expect(page.locator('#what-you-need-to-play')).toHaveCount(1);
});

test('sitemap includes the published blog routes', async ({ request }) => {
  const sitemapResponse = await request.get('/sitemap-0.xml');

  expect(sitemapResponse.ok()).toBe(true);

  const sitemap = await sitemapResponse.text();

  expect(sitemap).toContain('<loc>https://wouldyouratherquestions.org/blog/</loc>');
  expect(sitemap).toContain(
    '<loc>https://wouldyouratherquestions.org/blog/how-to-play-would-you-rather/</loc>',
  );
  expect(sitemap).not.toContain('/favorites/');
});

test('production typography and generated results are explained', async ({ page }) => {
  await page.goto('/would-you-rather-questions-game/');
  await expect(page.locator('html')).not.toHaveAttribute('data-font-preview', 'system');
  await page.locator('#choice-a').click();
  await expect(page.locator('.generated-result-disclosure')).toBeVisible();
  await expect(page.locator('.generated-result-disclosure')).toContainText('not live votes');
});

test('removing a favorite preserves focus and reuses the catalog', async ({ page, request }) => {
  const questions = (await publicCatalog(request)).filter((question) => !question.g).slice(0, 3);
  await page.addInitScript(
    (ids) => localStorage.setItem('wyr_favorites', JSON.stringify({ v: 2, ids })),
    questions.map((question) => question.id),
  );
  let requests = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/game-data/favorites.json')) requests++;
  });
  await page.goto('/favorites/');
  await expect(page.locator('.favorite-card')).toHaveCount(3);
  await page.locator('.favorite-card button').first().focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.favorite-card')).toHaveCount(2);
  await expect(page.locator('.favorite-card button').first()).toBeFocused();
  expect(requests).toBe(1);
});

test('favorites recover from a failed catalog without deleting saved IDs', async ({
  page,
  request,
}) => {
  const [question] = await publicCatalog(request);
  await page.addInitScript(
    (id) => localStorage.setItem('wyr_favorites', JSON.stringify({ v: 2, ids: [id] })),
    question!.id,
  );
  await page.route('**/game-data/favorites.json', (route) =>
    route.fulfill({ status: 503, body: 'Unavailable' }),
  );
  await page.goto('/favorites/');
  await expect(page.locator('#retry-favorites')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('wyr_favorites')!).ids)).toEqual(
    [question!.id],
  );
  await page.unroute('**/game-data/favorites.json');
  await page.locator('#retry-favorites').click();
  await expect(page.locator('.favorite-card')).toHaveCount(1);
});

test('game retry refreshes the manifest after a missing pack', async ({ page }) => {
  let manifestRequests = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/game-data/manifest.json')) manifestRequests++;
  });
  await page.route('**/game-data/**/pack-*.json', (route) =>
    route.fulfill({ status: 404, body: 'Old asset missing' }),
  );
  await page.goto('/would-you-rather-questions-game/');
  const initialId = await page.locator('#game-stage').getAttribute('data-question-id');
  await page.locator('#skip-button').click();
  await expect(page.locator('#next-button')).toContainText('Try again');
  await page.unroute('**/game-data/**/pack-*.json');
  await page.locator('#next-button').click();
  await expect(page.locator('#game-stage')).not.toHaveAttribute('data-question-id', initialId!);
  expect(manifestRequests).toBeGreaterThanOrEqual(2);
});

test('favorites provide a useful JavaScript-disabled state', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  try {
    const page = await context.newPage();
    await page.goto('/favorites/');
    await expect(page.locator('main')).toContainText('Enable JavaScript');
    await expect(page.locator('main')).not.toContainText('Loading saved questions');
    await page.goto('/favorites/play/');
    await expect(page.locator('#favorites-game-empty-text')).toContainText('Enable JavaScript');
    await expect(page.locator('noscript a[href="/categories/"]').last()).toBeVisible();
  } finally {
    await context.close();
  }
});

test('published page families pass accessibility checks', async ({ page }) => {
  test.setTimeout(90_000);
  const routes = [
    '/',
    '/would-you-rather-questions-game/',
    '/would-you-rather-questions-for-kids/',
    '/would-you-rather-questions-for-kids/page/2/',
    '/categories/',
    '/favorites/',
    '/favorites/play/',
    '/blog/',
    '/blog/how-to-play-would-you-rather/',
    '/about-us/',
    '/contact-us/',
    '/submit-a-question/',
    '/privacy-policy/',
    '/terms-and-conditions/',
    '/dmca/',
    '/accessibility/',
    '/cookie-policy/',
    '/editorial-policy/',
  ];
  for (const route of routes) {
    await page.goto(route);
    await page.evaluate(() => document.fonts.ready);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations, `Accessibility violations on ${route}`).toEqual([]);
  }
  await page.goto('/would-you-rather-questions-game/');
  await page.locator('#choice-a').click();
  await expect(page.locator('#game-stage')).toHaveAttribute('data-result-ready', '1');
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
    'Answered game',
  ).toEqual([]);
  await page.locator('#pack-button').click();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
    'Pack picker',
  ).toEqual([]);
});
