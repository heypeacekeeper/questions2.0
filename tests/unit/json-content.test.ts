import { describe, expect, it } from 'vitest';

import {
  JsonCategoryRepository,
  JsonQuestionRepository,
  loadJsonDataset,
} from '@/infrastructure/json/repositories';
import { parseRows, planImport } from '../../tools/import-csv';
import { exportRows } from '../../tools/export-questions';
import type { Question } from '@/domain/question';

const sampleQuestion: Question = {
  id: '44444444-4444-4444-8444-000000000002',
  optionA: 'Remember every dream',
  optionB: 'Forget every nightmare',
  status: 'published',
  shareCode: 'test235',
  sortOrder: 10,
  categoryIds: ['11111111-1111-4111-8111-000000000001'],
  isDemo: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  publishedAt: '2026-01-01T00:00:00.000Z',
};

describe('canonical JSON content', () => {
  it('loads the category catalog and resolves the current question corpus', async () => {
    const dataset = await loadJsonDataset();
    expect(dataset.categories).toHaveLength(28);
    const first = sampleQuestion;
    const sampleDataset = { ...dataset, questions: [first] };

    const questions = new JsonQuestionRepository(sampleDataset);
    const categories = new JsonCategoryRepository(sampleDataset);
    const category = dataset.categories.find((item) => item.id === first.categoryIds[0])!;
    const categoryQuestions = await questions.getQuestionsByCategory(category.id);
    expect(categoryQuestions.length).toBeGreaterThan(0);
    expect(
      (await categories.getAllCategories()).find((item) => item.id === category.id)
        ?.publishedQuestionCount,
    ).toBe(categoryQuestions.length);
    expect(await questions.getQuestionByShareCode(first.shareCode)).toMatchObject({ id: first.id });
  });

  it('imports CSV rows as stable local records and skips reversed duplicates', async () => {
    const dataset = await loadJsonDataset();
    const first = sampleQuestion;
    const sampleDataset = { ...dataset, questions: [...dataset.questions, first] };
    const csvCell = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const rows = parseRows(
      `option_a,option_b,categories,status\n${csvCell(first.optionB)},${csvCell(first.optionA)},for-kids,published\n"test-only ocean waves 6f81","test-only forest rain 6f81",for-kids|for-family,published\n`,
    );
    const plan = planImport(rows, sampleDataset, {
      now: '2026-09-30T00:00:00.000Z',
      newId: () => '44444444-4444-4444-8444-000000000001',
      newShareCode: () => 'abc2345',
    });
    expect(plan.skippedDuplicates).toBe(1);
    expect(plan.accepted).toHaveLength(1);
    expect(plan.accepted[0]).toMatchObject({
      id: '44444444-4444-4444-8444-000000000001',
      shareCode: 'abc2345',
      isDemo: false,
      status: 'published',
      publishedAt: '2026-09-30T00:00:00.000Z',
    });
    expect(plan.accepted[0]?.categoryIds).toHaveLength(2);
    expect(plan.primarySlugById.get(plan.accepted[0]!.id)).toBe('for-kids');
    const exportQuestion = exportRows({ ...dataset, questions: plan.accepted })[0]!;
    expect(exportQuestion.categories).toBe('for-kids|for-family');
  });

  it('rejects an unknown category before writing any JSON', async () => {
    const dataset = await loadJsonDataset();
    const rows = parseRows(
      'option_a,option_b,categories\nwalk on Mars,swim in Saturn,not-a-category\n',
    );
    expect(() => planImport(rows, dataset)).toThrow(/unknown category slug/);
  });
});
