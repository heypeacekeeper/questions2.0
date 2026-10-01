/** Build-time content repositories backed by versioned JSON files. */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type { Category, CategoryWithCount } from '@/domain/category';
import type { Question } from '@/domain/question';
import type { CategoryRepository, QuestionRepository } from '@/repositories/interfaces';
import { SEASONAL_WINDOWS } from '@/config/site';

export const CONTENT_DATA_DIRECTORY = resolve(process.cwd(), 'src/content/data');

export interface JsonDataset {
  readonly categories: readonly Category[];
  readonly questions: readonly Question[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(record: Record<string, unknown>, key: string, location: string): void {
  if (typeof record[key] !== 'string') throw new Error(`${location}: ${key} must be a string.`);
}

function requireBoolean(record: Record<string, unknown>, key: string, location: string): void {
  if (typeof record[key] !== 'boolean') throw new Error(`${location}: ${key} must be a boolean.`);
}

function requireNumber(record: Record<string, unknown>, key: string, location: string): void {
  if (typeof record[key] !== 'number' || !Number.isFinite(record[key])) {
    throw new Error(`${location}: ${key} must be a finite number.`);
  }
}

function requireNullableString(
  record: Record<string, unknown>,
  key: string,
  location: string,
): void {
  if (record[key] !== null && typeof record[key] !== 'string') {
    throw new Error(`${location}: ${key} must be a string or null.`);
  }
}

function requireStringArray(record: Record<string, unknown>, key: string, location: string): void {
  if (
    !Array.isArray(record[key]) ||
    !(record[key] as unknown[]).every((value) => typeof value === 'string')
  ) {
    throw new Error(`${location}: ${key} must be an array of strings.`);
  }
}

function readArray(path: string): unknown[] {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch (error) {
    throw new Error(
      `Could not read content file ${path}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  if (!Array.isArray(value)) throw new Error(`${path} must contain a JSON array.`);
  return value;
}

function readCategories(path: string): Category[] {
  return readArray(path).map((value, index) => {
    const location = `${path}[${index}]`;
    if (!isRecord(value)) throw new Error(`${location} must be a category object.`);
    for (const key of [
      'id',
      'name',
      'slug',
      'canonicalPath',
      'h1',
      'seoTitle',
      'metaDescription',
      'introduction',
      'shortDescription',
      'icon',
      'status',
      'createdAt',
      'updatedAt',
    ])
      requireString(value, key, location);
    for (const key of [
      'navFeatured',
      'includeInMixedGame',
      'requiresAgeGate',
      'isChildSafe',
      'isMature',
    ])
      requireBoolean(value, key, location);
    for (const key of ['seasonalStart', 'seasonalEnd']) requireNullableString(value, key, location);
    requireNumber(value, 'sortOrder', location);
    return value as unknown as Category;
  });
}

function readQuestions(path: string): Question[] {
  return readArray(path).map((value, index) => {
    const location = `${path}[${index}]`;
    if (!isRecord(value)) throw new Error(`${location} must be a question object.`);
    for (const key of ['id', 'optionA', 'optionB', 'status', 'shareCode', 'createdAt', 'updatedAt'])
      requireString(value, key, location);
    requireNullableString(value, 'publishedAt', location);
    requireStringArray(value, 'categoryIds', location);
    requireBoolean(value, 'isDemo', location);
    requireNumber(value, 'sortOrder', location);
    return value as unknown as Question;
  });
}

/** Read the complete local corpus once per build, never in a visitor request. */
export async function loadJsonDataset(
  directory: string = CONTENT_DATA_DIRECTORY,
): Promise<JsonDataset> {
  const categories = readCategories(join(directory, 'categories.json'));
  const questionsDirectory = join(directory, 'questions');
  let files: string[];
  try {
    files = readdirSync(questionsDirectory)
      .filter((file) => file.endsWith('.json'))
      .sort();
  } catch (error) {
    throw new Error(
      `Could not read question directory ${questionsDirectory}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  const questions = files.flatMap((file) => readQuestions(join(questionsDirectory, file)));
  return { categories, questions };
}

export class JsonQuestionRepository implements QuestionRepository {
  private readonly published: readonly Question[];
  private readonly byCategory = new Map<string, Question[]>();
  private readonly byShareCode = new Map<string, Question>();

  constructor(private readonly data: JsonDataset) {
    this.published = data.questions.filter((question) => question.status === 'published');
    for (const question of data.questions) {
      this.byShareCode.set(question.shareCode, question);
      if (question.status !== 'published') continue;
      for (const categoryId of question.categoryIds) {
        const list = this.byCategory.get(categoryId) ?? [];
        list.push(question);
        this.byCategory.set(categoryId, list);
      }
    }
  }

  async getAllQuestions(): Promise<readonly Question[]> {
    return this.data.questions;
  }

  async getPublishedQuestions(): Promise<readonly Question[]> {
    return this.published;
  }

  async getQuestionsByCategory(categoryId: string): Promise<readonly Question[]> {
    return this.byCategory.get(categoryId) ?? [];
  }

  async getQuestionByShareCode(shareCode: string): Promise<Question | null> {
    return this.byShareCode.get(shareCode) ?? null;
  }
}

export class JsonCategoryRepository implements CategoryRepository {
  private readonly allCategories: readonly CategoryWithCount[];
  private readonly published: readonly CategoryWithCount[];

  constructor(data: JsonDataset) {
    const counts = new Map<string, number>();
    for (const question of data.questions) {
      if (question.status !== 'published') continue;
      for (const categoryId of question.categoryIds) {
        counts.set(categoryId, (counts.get(categoryId) ?? 0) + 1);
      }
    }
    this.allCategories = data.categories.map((category) => ({
      ...category,
      publishedQuestionCount: counts.get(category.id) ?? 0,
    }));
    this.published = this.allCategories.filter((category) => category.status === 'published');
  }

  async getAllCategories(): Promise<readonly CategoryWithCount[]> {
    return this.allCategories;
  }

  async getPublishedCategories(): Promise<readonly CategoryWithCount[]> {
    return this.published;
  }

  async getNavigationCategories(): Promise<readonly CategoryWithCount[]> {
    return this.published.filter((category) => category.navFeatured);
  }

  async getSeasonalCategories(): Promise<readonly CategoryWithCount[]> {
    const seasonalSlugs = new Set(SEASONAL_WINDOWS.map((window) => window.slug));
    return this.published.filter(
      (category) =>
        seasonalSlugs.has(category.slug) ||
        (category.seasonalStart !== null && category.seasonalEnd !== null),
    );
  }
}
