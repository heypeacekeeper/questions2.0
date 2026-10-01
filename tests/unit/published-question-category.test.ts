import { describe, expect, it } from 'vitest';
import { validateContent } from '@/application/content-validation';
import type { CategoryWithCount } from '@/domain/category';
import type { Question, QuestionStatus } from '@/domain/question';
import { loadJsonDataset } from '@/infrastructure/json/repositories';

const jsonDataset = await loadJsonDataset();
const baseCategory = jsonDataset.categories[0]!;
const baseQuestion: Question = {
  id: '44444444-4444-4444-8444-000000000001',
  optionA: 'Remember every dream',
  optionB: 'Forget every nightmare',
  status: 'published',
  shareCode: 'test234',
  sortOrder: 10,
  categoryIds: [baseCategory.id],
  isDemo: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  publishedAt: '2026-01-01T00:00:00.000Z',
};

function category(id: string, status: CategoryWithCount['status']): CategoryWithCount {
  return {
    ...baseCategory,
    id,
    status,
    slug: `${status}-${id}`,
    canonicalPath: `/${status}-${id}/`,
    publishedQuestionCount: status === 'published' ? 1 : 0,
  };
}

function question(status: QuestionStatus, categoryIds: readonly string[]): Question {
  return {
    ...baseQuestion,
    id: `question-${status}-${categoryIds.join('-')}`,
    status,
    categoryIds,
    isDemo: false,
  };
}

function publishedCategoryIssues(categories: readonly CategoryWithCount[], candidate: Question) {
  return validateContent(categories, [candidate], {
    allowDemoContent: true,
  }).filter((issue) => issue.code === 'QUESTION_NO_PUBLISHED_CATEGORY');
}

describe('published question category integrity', () => {
  it('accepts a published question with a published category', () => {
    const published = category('published', 'published');

    expect(publishedCategoryIssues([published], question('published', [published.id]))).toEqual([]);
  });

  it.each(['draft', 'archived'] as const)(
    'rejects a published question linked only to a %s category',
    (status) => {
      const unavailable = category(status, status);
      const candidate = question('published', [unavailable.id]);

      expect(publishedCategoryIssues([unavailable], candidate)).toEqual([
        expect.objectContaining({
          severity: 'error',
          code: 'QUESTION_NO_PUBLISHED_CATEGORY',
          records: [candidate.id],
        }),
      ]);
    },
  );

  it('accepts a published question when at least one linked category is published', () => {
    const draft = category('draft', 'draft');
    const published = category('published', 'published');

    expect(
      publishedCategoryIssues([draft, published], question('published', [draft.id, published.id])),
    ).toEqual([]);
  });

  it('allows a draft question to remain in a draft category', () => {
    const draft = category('draft', 'draft');

    expect(publishedCategoryIssues([draft], question('draft', [draft.id]))).toEqual([]);
  });
});
