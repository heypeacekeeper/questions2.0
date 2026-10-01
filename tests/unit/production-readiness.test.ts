import { afterEach, describe, expect, it, vi } from 'vitest';
import { JsonCategoryRepository, loadJsonDataset } from '@/infrastructure/json/repositories';
import { validateContent } from '@/application/content-validation';
import { computeContentChecksum } from '@/application/manifest-service';
import { FavoriteStore, MAX_FAVORITES } from '@/lib/favorites';
import { fetchJson } from '@/lib/fetch-json';
import { GameEngine, SessionSeenStore } from '@/scripts/game-engine';
import { isSitemapEligible } from '@/config/site-static.mjs';
import { asCsv, exportRows } from '../../tools/export-questions';
import { publisherDetailsComplete } from '@/config/publisher';
import { buildAppEnv } from '@/config/env';

const dataset = await loadJsonDataset();
const categories = await new JsonCategoryRepository(dataset).getAllCategories();
const question = dataset.questions[0]!;
const codes = (questions = dataset.questions, cats = categories) =>
  validateContent(cats, questions, { allowDemoContent: false })
    .filter((issue) => issue.severity === 'error')
    .map((issue) => issue.code);

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('production content integrity', () => {
  it('keeps incomplete policy details and unfinished advertising out of a public release', () => {
    const owner = {
      name: 'Test publisher',
      address: 'Test address',
      jurisdiction: 'Test jurisdiction',
      copyrightContact: 'Test contact',
      policyUpdatedAt: '2026-10-01',
      policiesReviewed: true,
    };
    expect(publisherDetailsComplete({ ...owner, policiesReviewed: false })).toBe(false);
    expect(publisherDetailsComplete(owner)).toBe(true);
    expect(publisherDetailsComplete({ ...owner, policyUpdatedAt: '2026-02-30' })).toBe(false);
    expect(() =>
      buildAppEnv(
        { FEATURE_ADS: 'true', PUBLIC_ADSENSE_PUBLISHER_ID: 'ca-pub-1234567890123456' },
        { mode: 'production' },
      ),
    ).toThrow(/Advertising is not launch-ready/);
  });
  it('rejects invalid identifiers, dates, ordering and duplicate category relationships', () => {
    expect(
      codes([
        {
          ...question,
          id: '',
          createdAt: '2026-02-30T00:00:00Z',
          publishedAt: null,
          sortOrder: 1.5,
          categoryIds: [...question.categoryIds, ...question.categoryIds],
        },
      ]),
    ).toEqual(
      expect.arrayContaining([
        'QUESTION_INVALID_ID',
        'QUESTION_INVALID_DATES',
        'QUESTION_INVALID_ORDER',
        'QUESTION_DUPLICATE_CATEGORY',
      ]),
    );
  });
  it('rejects duplicated category identities and an empty production corpus', () => {
    expect(
      codes(dataset.questions, [
        ...categories,
        { ...categories[0]!, slug: 'extra-category', canonicalPath: '/extra-category/' },
      ]),
    ).toContain('CATEGORY_DUPLICATE_ID');
    expect(codes([])).toContain('CONTENT_EMPTY');
  });
  it('changes provenance for audience flags and blog content but not object key order', async () => {
    const original = await computeContentChecksum(categories, dataset.questions);
    const changed = categories.map((category, index) =>
      index === 0 ? { ...category, requiresAgeGate: !category.requiresAgeGate } : category,
    );
    expect(await computeContentChecksum(changed, dataset.questions)).not.toBe(original);
    expect(
      await computeContentChecksum([...categories].reverse(), [...dataset.questions].reverse()),
    ).toBe(original);
    expect(
      await computeContentChecksum(categories, dataset.questions, [
        { id: 'article', body: 'Changed content', data: {} },
      ]),
    ).not.toBe(original);
  });
  it('excludes device-local utility pages from the sitemap', () => {
    expect(isSitemapEligible('https://example.org/favorites/')).toBe(false);
    expect(isSitemapEligible('https://example.org/favorites/play/')).toBe(false);
    expect(isSitemapEligible('https://example.org/categories/')).toBe(true);
  });
  it('neutralizes spreadsheet formulas while preserving ordinary editorial text', () => {
    const rows = exportRows({
      ...dataset,
      questions: [
        { ...question, optionA: '=HYPERLINK("https://example.org")', optionB: 'Ordinary text' },
      ],
    });
    expect(asCsv(rows)).toContain("'=HYPERLINK");
    expect(asCsv(rows)).toContain('Ordinary text');
  });
});

describe('Favorites capacity', () => {
  it('refuses an additional save without removing existing favorites', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
      removeItem: (key: string) => data.delete(key),
    } as unknown as Storage;
    const store = new FavoriteStore(storage);
    for (let index = 0; index < MAX_FAVORITES; index++) store.saveId(`q-${index}`);
    const before = store.getIds();
    expect(store.saveId('one-too-many')).toEqual({ ok: false, saved: false, reason: 'limit' });
    expect(store.getIds()).toEqual(before);
    expect(store.saveId('q-0')).toEqual({ ok: true, saved: true });
  });
});

describe('network and session recovery', () => {
  it('starts at a random pack and visits every pack once without repeating questions', async () => {
    const fetched: string[] = [];
    const engine = new GameEngine(
      new SessionSeenStore('random-start', null),
      async (url) => {
        fetched.push(url);
        return [0, 1].map((i) => ({ id: `${url}-${i}`, a: 'A', b: 'B', s: 'abc2345' }));
      },
      1,
      () => 0.6,
    );
    const entry = {
      slug: 'mixed',
      name: 'Mixed',
      icon: '',
      requiresAgeGate: false,
      total: 6,
      packs: ['/first', '/second', '/third'],
    };
    await engine.useSet(entry);
    expect(fetched).toEqual(['/second']);
    const shown: string[] = [];
    for (let i = 0; i < 6; i++) {
      const question = await engine.next(shown.at(-1) ?? null);
      expect(question).not.toBeNull();
      shown.push(question!.id);
      await engine.ensureSupply();
    }
    expect(new Set(shown).size).toBe(6);
    expect(fetched).toEqual(['/second', '/third', '/first']);
    expect(entry.packs).toEqual(['/first', '/second', '/third']);
  });
  it('aborts a stalled download within its time budget', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, options: RequestInit) =>
          new Promise((_resolve, reject) =>
            options.signal!.addEventListener(
              'abort',
              () => reject(new DOMException('Aborted', 'AbortError')),
              { once: true },
            ),
          ),
      ),
    );
    const rejected = expect(fetchJson('/stalled', { timeoutMs: 100 })).rejects.toMatchObject({
      name: 'AbortError',
    });
    await vi.advanceTimersByTimeAsync(100);
    await rejected;
  });
  it('cancels obsolete pack requests without reporting the new set as failed', async () => {
    let oldSignal: AbortSignal | undefined;
    const engine = new GameEngine(new SessionSeenStore('seen', null), async (url, signal) => {
      if (url === '/old') {
        oldSignal = signal;
        return new Promise((_resolve, reject) =>
          signal!.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }),
        );
      }
      return [{ id: 'new', a: 'New A', b: 'New B', s: 'new0001' }];
    });
    const entry = {
      slug: 'test',
      name: 'Test',
      icon: '',
      requiresAgeGate: false,
      total: 1,
      packs: ['/old'],
    };
    const oldLoad = engine.useSet(entry);
    await engine.useSet({ ...entry, packs: ['/new'] });
    await oldLoad;
    expect(oldSignal?.aborted).toBe(true);
    expect(engine.supplyLoadFailed).toBe(false);
    expect((await engine.next(null))?.id).toBe('new');
  });
  it('ignores malformed stored session state', () => {
    const storage = { getItem: () => '"not-an-array"' } as unknown as Storage;
    expect([...new SessionSeenStore('seen', storage).get()]).toEqual([]);
  });
});
