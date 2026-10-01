import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isSeasonalCategoryActive, isWithinWindow } from '@/application/category-service';
import { hasErrors, validateContent } from '@/application/content-validation';
import { pickNextUnseen, QuestionService } from '@/application/question-service';
import { buildAppEnv } from '@/config/env';
import { SEASONAL_WINDOWS } from '@/config/site';
import { isSitemapEligible } from '@/config/site-static.mjs';
import type { Question } from '@/domain/question';
import { paginate } from '@/domain/site';
import {
  JsonCategoryRepository,
  JsonQuestionRepository,
  loadJsonDataset,
} from '@/infrastructure/json/repositories';
import { normalizePath } from '@/lib/performance-path';
import { normalizeForComparison, questionPairFingerprint } from '@/lib/text';
import {
  formatGeneratedPercent,
  GameEngine,
  generatedDisplayResult,
  parseGameDataManifest,
  parsePackFilePayload,
  SessionSeenStore,
} from '@/scripts/game-engine';

const jsonDataset = await loadJsonDataset();
const sampleQuestion: Question = {
  id: '44444444-4444-4444-8444-000000000003',
  optionA: 'Remember every dream',
  optionB: 'Forget every nightmare',
  status: 'published',
  shareCode: 'test236',
  sortOrder: 10,
  categoryIds: [jsonDataset.categories[0]!.id],
  isDemo: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  publishedAt: '2026-01-01T00:00:00.000Z',
};

describe('pagination', () => {
  it('continues numbering', () => {
    const items = Array.from({ length: 120 }, (_, index) => index);
    expect(paginate(items, 2, 50)).toMatchObject({
      startIndex: 51,
      endIndex: 100,
      totalPages: 3,
    });
    expect(paginate(items, 3, 50).items).toHaveLength(20);
  });

  it('uses one page for empty lists', () => {
    expect(paginate([], 1, 50).totalPages).toBe(1);
  });
});

describe('randomization', () => {
  it('never selects an already seen id', () => {
    const pool = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const seen = new Set<string>();
    for (let index = 0; index < 3; index += 1) {
      const question = pickNextUnseen(pool, seen);
      expect(question).not.toBeNull();
      seen.add(question!.id);
    }
    expect(pickNextUnseen(pool, seen)).toBeNull();
  });
});

describe('mixed game filtering', () => {
  it('excludes a question cross-listed in a mature or age-gated category', async () => {
    const data = { ...jsonDataset, questions: [sampleQuestion] };
    const categories = await new JsonCategoryRepository(data).getAllCategories();
    const safe = categories.find(
      (category) =>
        category.includeInMixedGame &&
        category.isMature === false &&
        category.requiresAgeGate === false,
    );
    const restricted = categories.find((category) => category.isMature || category.requiresAgeGate);

    if (safe === undefined || restricted === undefined) {
      throw new Error('Expected safe and restricted fixture categories');
    }

    const crossListedQuestion = {
      ...data.questions[0]!,
      id: 'cross-listed-question',
      categoryIds: [safe.id, restricted.id],
    };
    const service = new QuestionService(
      new JsonQuestionRepository({
        categories: data.categories,
        questions: [crossListedQuestion],
      }),
    );

    const mixed = await service.getMixedGameQuestions([safe], categories, () => 0);

    expect(mixed).toEqual([]);
  });
});

describe('seasonal windows', () => {
  it('handles normal and wrapping windows', () => {
    expect(
      isWithinWindow(
        new Date('2026-10-15T00:00:00Z'),
        { month: 9, day: 1 },
        { month: 10, day: 31 },
      ),
    ).toBe(true);
    expect(
      isWithinWindow(
        new Date('2026-01-05T00:00:00Z'),
        { month: 12, day: 1 },
        { month: 2, day: 28 },
      ),
    ).toBe(true);
    expect(
      isWithinWindow(
        new Date('2026-06-05T00:00:00Z'),
        { month: 12, day: 1 },
        { month: 2, day: 28 },
      ),
    ).toBe(false);
  });

  it('uses configured category windows', () => {
    expect(
      isSeasonalCategoryActive(
        { slug: 'halloween', seasonalStart: null, seasonalEnd: null },
        new Date('2026-10-01T00:00:00Z'),
        SEASONAL_WINDOWS,
      ),
    ).toBe(true);
  });
});

describe('content helpers', () => {
  it('detects reversed duplicate questions', () => {
    expect(questionPairFingerprint('Sweat maple syrup', 'sneeze glitter!')).toBe(
      questionPairFingerprint('Sneeze glitter', 'sweat maple syrup'),
    );
  });

  const duplicateQuestion = (
    id: string,
    shareCode: string,
    optionA: string,
    optionB: string,
  ): Question => ({
    ...sampleQuestion,
    id,
    shareCode,
    optionA,
    optionB,
    status: 'published',
    categoryIds: [],
    isDemo: false,
  });

  const duplicateIssues = (...questions: Question[]) =>
    validateContent([], questions, { allowDemoContent: true }).filter((issue) =>
      ['QUESTION_DUPLICATE', 'QUESTION_REVERSED_DUPLICATE'].includes(issue.code),
    );

  it('reports a reversed duplicate pair', () => {
    const issues = duplicateIssues(
      duplicateQuestion('reverse-1', 'rev0001', 'Live on Mars', 'Live underwater'),
      duplicateQuestion('reverse-2', 'rev0002', 'Live underwater', 'Live on Mars'),
    );

    expect(issues).toEqual([
      expect.objectContaining({
        code: 'QUESTION_REVERSED_DUPLICATE',
        records: ['reverse-1', 'reverse-2'],
      }),
    ]);
  });

  it('reports exact duplicates without calling them reversed', () => {
    const issues = duplicateIssues(
      duplicateQuestion('exact-1', 'exct001', 'Live on Mars', 'Live underwater'),
      duplicateQuestion('exact-2', 'exct002', 'Live on Mars', 'Live underwater'),
    );

    expect(issues).toEqual([
      expect.objectContaining({
        code: 'QUESTION_DUPLICATE',
        records: ['exact-1', 'exact-2'],
      }),
    ]);
  });

  it('reports exact duplicates plus a third reversed record', () => {
    const issues = duplicateIssues(
      duplicateQuestion('mixed-1', 'mix0001', 'Live on Mars', 'Live underwater'),
      duplicateQuestion('mixed-2', 'mix0002', 'Live on Mars', 'Live underwater'),
      duplicateQuestion('mixed-3', 'mix0003', 'Live underwater', 'Live on Mars'),
    );

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'QUESTION_DUPLICATE',
          records: ['mixed-1', 'mixed-2'],
        }),
        expect.objectContaining({
          code: 'QUESTION_REVERSED_DUPLICATE',
          records: ['mixed-1', 'mixed-2', 'mixed-3'],
        }),
      ]),
    );
  });

  it('strips the question lead-in', () => {
    expect(normalizeForComparison('Would you rather Fly?')).toBe('fly');
  });

  it('validates fixture content and share lookup', async () => {
    const data = { ...jsonDataset, questions: [sampleQuestion] };
    const categories = await new JsonCategoryRepository(data).getAllCategories();
    const questions = await new JsonQuestionRepository(data).getAllQuestions();
    expect(hasErrors(validateContent(categories, questions, { allowDemoContent: true }))).toBe(
      false,
    );
    const first = data.questions[0]!;
    expect(
      (await new JsonQuestionRepository(data).getQuestionByShareCode(first.shareCode))?.id,
    ).toBe(first.id);
  });
});

describe('sitemap safeguards', () => {
  it('excludes share pages from the sitemap', () => {
    expect(isSitemapEligible('https://x.org/s/abc/')).toBe(false);
  });
});

describe('strict environment booleans', () => {
  it('rejects invalid boolean values instead of silently using defaults', () => {
    expect(() =>
      buildAppEnv(
        {
          FEATURE_ADS: 'treu',
        },
        { mode: 'development' },
      ),
    ).toThrow(/FEATURE_ADS must be a boolean value/);
  });

  it('accepts supported boolean spellings', () => {
    const result = buildAppEnv(
      {
        FEATURE_ADS: 'yes',
        FEATURE_GA4: '0',
        PUBLIC_ADSENSE_PUBLISHER_ID: 'ca-pub-1234567890123456',
      },
      { mode: 'development' },
    );

    expect(result.features.FEATURE_ADS).toBe(true);
    expect(result.features.FEATURE_GA4).toBe(false);
  });
});

describe('cache policy', () => {
  const headers = readFileSync(new URL('../../public/_headers', import.meta.url), 'utf8');
  const middleware = readFileSync(new URL('../../src/middleware.ts', import.meta.url), 'utf8');

  it('caches only fingerprinted assets permanently', () => {
    expect(headers).toMatch(
      /\/_astro\/\*[\s\S]*Cache-Control: public, max-age=31536000, immutable/,
    );
    expect(headers).toMatch(
      /\/game-data\/:pack\/pack-\*[\s\S]*Cache-Control: public, max-age=31536000, immutable/,
    );
  });

  it('keeps mutable catalogs short-lived', () => {
    expect(headers).toMatch(
      /\/game-data\/manifest\.json[\s\S]*Cache-Control: public, max-age=300, must-revalidate/,
    );
    expect(headers).toMatch(
      /\/game-data\/favorites\.json[\s\S]*Cache-Control: public, max-age=300, must-revalidate/,
    );
  });

  it('never caches APIs or the deployment manifest', () => {
    expect(headers).toMatch(/\/deployment-manifest\.json[\s\S]*Cache-Control: no-store/);
    expect(middleware).toMatch(
      /pathname\.startsWith\('\/api\/'\)[\s\S]*cache-control', 'no-store'/,
    );
  });
});

describe('client-only game helpers', () => {
  it('normalizes Windows and POSIX asset paths', () => {
    expect(normalizePath('dist\\client\\_astro\\game.js')).toBe('dist/client/_astro/game.js');
    expect(normalizePath('dist/client/_astro/game.js')).toBe('dist/client/_astro/game.js');
  });

  it('keeps seen question ids in session storage', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    } as unknown as Storage;
    const seen = new SessionSeenStore('game:seen', storage);

    seen.add('first');
    seen.add('second');
    expect([...seen.get()]).toEqual(['first', 'second']);
    seen.clear();
    expect(seen.get()).toEqual(new Set());
  });
});

describe('game-data payload validation', () => {
  const validQuestion = {
    id: 'question-1',
    a: 'Option A',
    b: 'Option B',
    s: 'abc2345',
  };

  it('accepts a valid pack and rejects malformed questions', () => {
    expect(
      parsePackFilePayload({
        v: 2,
        set: 'mixed',
        i: 0,
        n: 1,
        q: [validQuestion],
      }),
    ).toEqual([validQuestion]);

    expect(() =>
      parsePackFilePayload({
        v: 2,
        set: 'mixed',
        i: 0,
        n: 1,
        q: [{ ...validQuestion, id: '' }],
      }),
    ).toThrow(/Invalid question/);

    expect(() =>
      parsePackFilePayload({
        v: 1,
        set: 'mixed',
        i: 0,
        n: 1,
        q: [validQuestion],
      }),
    ).toThrow(/Invalid game-data pack metadata/);
  });

  it('rejects duplicate question ids inside a pack', () => {
    expect(() =>
      parsePackFilePayload({
        v: 2,
        set: 'mixed',
        i: 0,
        n: 1,
        q: [validQuestion, validQuestion],
      }),
    ).toThrow(/Invalid question/);
  });

  it('validates manifest metadata and pack URLs', () => {
    const validManifest = {
      version: 1,
      generatedAt: '2026-09-15T00:00:00.000Z',
      sets: {
        mixed: {
          slug: 'mixed',
          name: 'Mixed',
          icon: '🎲',
          requiresAgeGate: false,
          total: 1,
          packs: ['/game-data/mixed/pack-01.abcdef1234.json'],
        },
      },
    };

    expect(parseGameDataManifest(validManifest)).toEqual(validManifest);
    expect(
      parseGameDataManifest({
        ...validManifest,
        sets: {
          mixed: {
            ...validManifest.sets.mixed,
            packs: ['https://attacker.example/pack.json'],
          },
        },
      }),
    ).toBeNull();
  });
});

describe('game engine pack loading', () => {
  it('retries a pack after a temporary fetch failure', async () => {
    let attempts = 0;
    const engine = new GameEngine(
      new SessionSeenStore('retry-seen', null),
      async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('temporary failure');
        return [
          {
            id: 'question-1',
            a: 'Option A',
            b: 'Option B',
            s: 'retry01',
          },
        ];
      },
      1,
      () => 0,
    );

    await engine.useSet({
      slug: 'retry',
      name: 'Retry',
      icon: '🎲',
      requiresAgeGate: false,
      total: 1,
      packs: ['/game-data/retry/pack-01.json'],
    });

    expect(attempts).toBe(1);

    const question = await engine.next(null);

    expect(attempts).toBe(2);
    expect(question?.id).toBe('question-1');
  });
  it('avoids repeats and restarts after all questions are seen', async () => {
    const engine = new GameEngine(
      new SessionSeenStore('repeat-seen', null),
      async () => [
        { id: 'question-1', a: 'A1', b: 'B1', s: 'repeat1' },
        { id: 'question-2', a: 'A2', b: 'B2', s: 'repeat2' },
      ],
      1,
      () => 0,
    );

    await engine.useSet({
      slug: 'repeat',
      name: 'Repeat',
      icon: '🎲',
      requiresAgeGate: false,
      total: 2,
      packs: ['/game-data/repeat/pack-01.json'],
    });

    const first = await engine.next(null);
    const second = await engine.next(first?.id ?? null);
    const restarted = await engine.next(second?.id ?? null);

    expect(first?.id).toBe('question-1');
    expect(second?.id).toBe('question-2');
    expect(restarted?.id).toBe('question-1');
  });

  it('returns null when a pack only contains the current question', async () => {
    const engine = new GameEngine(
      new SessionSeenStore('single-seen', null),
      async () => [{ id: 'only-question', a: 'Option A', b: 'Option B', s: 'only001' }],
      1,
      () => 0,
    );

    await engine.useSet({
      slug: 'single',
      name: 'Single',
      icon: '🎲',
      requiresAgeGate: false,
      total: 1,
      packs: ['/game-data/single/pack-01.json'],
    });

    const question = await engine.next(null);
    expect(question?.id).toBe('only-question');

    expect(await engine.next(question?.id ?? null)).toBeNull();
  });
});

describe('game category switching', () => {
  it('ignores an old pack download after switching categories', async () => {
    let resolveOld!: (questions: Array<{ id: string; a: string; b: string; s: string }>) => void;
    const engine = new GameEngine(
      new SessionSeenStore('race-seen', null),
      async (url) => {
        if (url === '/old-pack.json') {
          return new Promise((resolve) => {
            resolveOld = resolve;
          });
        }
        return [{ id: 'new-question', a: 'New A', b: 'New B', s: 'new0001' }];
      },
      1,
      () => 0,
    );

    const oldLoad = engine.useSet({
      slug: 'old',
      name: 'Old',
      icon: '',
      requiresAgeGate: false,
      total: 1,
      packs: ['/old-pack.json'],
    });
    const newLoad = engine.useSet({
      slug: 'new',
      name: 'New',
      icon: '',
      requiresAgeGate: false,
      total: 1,
      packs: ['/new-pack.json'],
    });

    await newLoad;
    const current = await engine.next(null);
    expect(current?.id).toBe('new-question');

    resolveOld([{ id: 'old-question', a: 'Old A', b: 'Old B', s: 'old0001' }]);
    await oldLoad;

    expect(await engine.next(current?.id ?? null)).toBeNull();
  });
});

describe('game background loading', () => {
  it('does not block an available question while prefetching', async () => {
    const calls: string[] = [];
    let finishPrefetch = () => {};
    const engine = new GameEngine(
      new SessionSeenStore('prefetch-seen', null),
      async (url) => {
        calls.push(url);
        if (url === '/pack-2.json') {
          return new Promise((resolve) => {
            finishPrefetch = () => resolve([{ id: 'q3', a: 'A3', b: 'B3', s: 'pref003' }]);
          });
        }
        return [
          { id: 'q1', a: 'A1', b: 'B1', s: 'pref001' },
          { id: 'q2', a: 'A2', b: 'B2', s: 'pref002' },
        ];
      },
      2,
      () => 0,
    );

    await engine.useSet({
      slug: 'prefetch',
      name: 'Prefetch',
      icon: '',
      requiresAgeGate: false,
      total: 3,
      packs: ['/pack-1.json', '/pack-2.json'],
    });

    const first = await engine.next(null);
    expect(calls).toEqual(['/pack-1.json', '/pack-2.json']);

    const second = await engine.next(first?.id ?? null);
    expect(second?.id).toBe('q2');

    finishPrefetch();
    await engine.ensureSupply();
  });
});

describe('generated display results', () => {
  it('is deterministic and uses complementary in-range percentages', () => {
    const first = generatedDisplayResult('question-stable-id');
    const second = generatedDisplayResult('question-stable-id');

    expect(first).toEqual(second);
    expect(first.percentA).toBeGreaterThanOrEqual(25);
    expect(first.percentA).toBeLessThanOrEqual(75);
    expect(first.percentB).toBeGreaterThanOrEqual(25);
    expect(first.percentB).toBeLessThanOrEqual(75);
    expect(first.percentA * 10 + first.percentB * 10).toBe(1000);
  });

  it('formats every displayed percentage with one decimal place', () => {
    const result = generatedDisplayResult('format-id');
    expect(formatGeneratedPercent(result.percentA)).toMatch(/^\d+\.\d%$/);
    expect(formatGeneratedPercent(result.percentB)).toMatch(/^\d+\.\d%$/);
  });

  it('produces more than one split across several question ids', () => {
    const splits = new Set(
      ['question-a', 'question-b', 'question-c', 'question-d', 'question-e'].map((id) =>
        formatGeneratedPercent(generatedDisplayResult(id).percentA),
      ),
    );
    expect(splits.size).toBeGreaterThan(1);
  });

  it('does not regenerate results when the selection changes from A to B', () => {
    const resultsShownForSelections = ['A', 'B'].map(() =>
      generatedDisplayResult('same-question-id'),
    );
    expect(resultsShownForSelections[0]).toEqual(resultsShownForSelections[1]);
  });
});
