/** In-memory mock repositories for local development and tests. */
import type { Category, CategoryWithCount } from '@/domain/category';
import type { Question } from '@/domain/question';
import type { CategoryRepository, QuestionRepository } from '@/repositories/interfaces';
import { SEASONAL_WINDOWS } from '@/config/site';
import { ALL_CATEGORIES, DEMO_QUESTIONS, generateMockFillerQuestions } from './fixtures';

export interface MockDataset {
  categories: readonly Category[];
  questions: readonly Question[];
}
export function createDefaultMockDataset(fillerCount = 130): MockDataset {
  return {
    categories: ALL_CATEGORIES,
    questions: [...DEMO_QUESTIONS, ...generateMockFillerQuestions(fillerCount)],
  };
}
function withCounts(
  categories: readonly Category[],
  questions: readonly Question[],
): CategoryWithCount[] {
  return categories.map((c) => ({
    ...c,
    publishedQuestionCount: questions.filter(
      (q) => q.status === 'published' && q.categoryIds.includes(c.id),
    ).length,
  }));
}

export class MockQuestionRepository implements QuestionRepository {
  constructor(private readonly data: MockDataset) {}
  async getAllQuestions(): Promise<readonly Question[]> {
    return this.data.questions;
  }
  async getPublishedQuestions(): Promise<readonly Question[]> {
    return this.data.questions.filter((q) => q.status === 'published');
  }
  async getQuestionsByCategory(categoryId: string): Promise<readonly Question[]> {
    return (await this.getPublishedQuestions()).filter((q) => q.categoryIds.includes(categoryId));
  }
  async getQuestionByShareCode(shareCode: string): Promise<Question | null> {
    return this.data.questions.find((q) => q.shareCode === shareCode) ?? null;
  }
}
export class MockCategoryRepository implements CategoryRepository {
  constructor(private readonly data: MockDataset) {}
  private all(): CategoryWithCount[] {
    return withCounts(this.data.categories, this.data.questions);
  }
  async getAllCategories(): Promise<readonly CategoryWithCount[]> {
    return this.all();
  }
  async getPublishedCategories(): Promise<readonly CategoryWithCount[]> {
    return this.all().filter((c) => c.status === 'published');
  }
  async getNavigationCategories(): Promise<readonly CategoryWithCount[]> {
    return (await this.getPublishedCategories()).filter((c) => c.navFeatured);
  }
  async getSeasonalCategories(): Promise<readonly CategoryWithCount[]> {
    const slugs = new Set(SEASONAL_WINDOWS.map((w) => w.slug));
    return (await this.getPublishedCategories()).filter(
      (c) => slugs.has(c.slug) || (c.seasonalStart && c.seasonalEnd),
    );
  }
}
