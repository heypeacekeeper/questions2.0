#!/usr/bin/env node
/**
 * Add questions from CSV to versioned JSON files. No database or account needed.
 *
 * Required columns: option_a, option_b, categories (pipe-separated slugs)
 * Optional columns: status (defaults to draft), sort_order, is_demo
 *
 * npm run import:csv -- --file ./questions.csv --dry-run
 * npm run import:csv -- --file ./questions.csv
 */
import { randomUUID } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { format, resolveConfig } from 'prettier';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Category } from '../src/domain/category';
import type { Question, QuestionStatus } from '../src/domain/question';
import { generateShareCode } from '../src/lib/crypto';
import { normalizeForComparison, questionPairFingerprint } from '../src/lib/text';
import {
  CONTENT_DATA_DIRECTORY,
  JsonCategoryRepository,
  loadJsonDataset,
  type JsonDataset,
} from '../src/infrastructure/json/repositories';
import { formatIssues, hasErrors, validateContent } from '../src/application/content-validation';

export interface ImportRow {
  optionA: string;
  optionB: string;
  categorySlugs: string[];
  status: QuestionStatus;
  sortOrder: number | undefined;
  isDemo: boolean;
  line: number;
}

export interface ImportPlan {
  readonly accepted: readonly Question[];
  readonly skippedDuplicates: number;
  readonly primarySlugById: ReadonlyMap<string, string>;
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

/** RFC 4180-style quoted cells, including commas, escaped quotes and newlines. */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]!;
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') field += char;
  }
  if (quoted) throw new Error('CSV contains an unterminated quoted field.');
  if (field.length > 0 || row.length > 0) rows.push([...row, field]);
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''));
}

function parseBoolean(value: string, line: number): boolean {
  if (!value) return false;
  if (['true', '1', 'yes'].includes(value.toLowerCase())) return true;
  if (['false', '0', 'no'].includes(value.toLowerCase())) return false;
  throw new Error(`Line ${line}: is_demo must be true or false.`);
}

export function parseRows(csv: string): ImportRow[] {
  const records = parseCsv(csv);
  const header = records.shift()?.map((value) => value.trim().toLowerCase());
  if (!header) throw new Error('CSV is empty.');
  for (const key of ['option_a', 'option_b', 'categories']) {
    if (!header.includes(key)) throw new Error(`Missing required CSV column: ${key}`);
  }
  const read = (cells: string[], key: string) => cells[header.indexOf(key)]?.trim() ?? '';
  return records.map((cells, index) => {
    const line = index + 2;
    const optionA = read(cells, 'option_a');
    const optionB = read(cells, 'option_b');
    const categorySlugs = read(cells, 'categories')
      .split('|')
      .map((slug) => slug.trim())
      .filter(Boolean);
    const statusRaw = read(cells, 'status') || 'draft';
    const sortRaw = read(cells, 'sort_order');
    const sortOrder = sortRaw ? Number(sortRaw) : undefined;

    if (optionA.length < 2 || optionA.length > 200 || optionB.length < 2 || optionB.length > 200) {
      throw new Error(`Line ${line}: options must contain 2–200 characters.`);
    }
    if (normalizeForComparison(optionA) === normalizeForComparison(optionB)) {
      throw new Error(`Line ${line}: options must be different.`);
    }
    if (categorySlugs.length === 0)
      throw new Error(`Line ${line}: at least one category slug is required.`);
    if (new Set(categorySlugs).size !== categorySlugs.length) {
      throw new Error(`Line ${line}: categories contains duplicate slugs.`);
    }
    if (!['draft', 'published', 'archived'].includes(statusRaw)) {
      throw new Error(`Line ${line}: invalid status "${statusRaw}".`);
    }
    if (
      sortOrder !== undefined &&
      (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 10_000_000)
    ) {
      throw new Error(`Line ${line}: invalid sort_order.`);
    }
    return {
      optionA,
      optionB,
      categorySlugs,
      status: statusRaw as QuestionStatus,
      sortOrder,
      isDemo: parseBoolean(read(cells, 'is_demo'), line),
      line,
    };
  });
}

/** Resolve slugs, reject duplicate wording, and assign permanent IDs/codes once. */
export function planImport(
  rows: readonly ImportRow[],
  dataset: JsonDataset,
  options: {
    now?: string;
    newId?: () => string;
    newShareCode?: () => string;
  } = {},
): ImportPlan {
  const now = options.now ?? new Date().toISOString();
  const newId = options.newId ?? randomUUID;
  const newShareCode = options.newShareCode ?? generateShareCode;
  const categoryBySlug = new Map(dataset.categories.map((category) => [category.slug, category]));
  const fingerprints = new Set(
    dataset.questions.map((question) =>
      questionPairFingerprint(question.optionA, question.optionB),
    ),
  );
  const ids = new Set(dataset.questions.map((question) => question.id));
  const codes = new Set(dataset.questions.map((question) => question.shareCode));
  const maxOrder = new Map<string, number>();
  for (const question of dataset.questions) {
    for (const categoryId of question.categoryIds) {
      maxOrder.set(categoryId, Math.max(maxOrder.get(categoryId) ?? 0, question.sortOrder));
    }
  }

  const accepted: Question[] = [];
  const primarySlugById = new Map<string, string>();
  let skippedDuplicates = 0;
  for (const row of rows) {
    const categories: Category[] = row.categorySlugs.map((slug) => {
      const category = categoryBySlug.get(slug);
      if (!category) throw new Error(`Line ${row.line}: unknown category slug "${slug}".`);
      return category;
    });
    const fingerprint = questionPairFingerprint(row.optionA, row.optionB);
    if (fingerprints.has(fingerprint)) {
      skippedDuplicates += 1;
      continue;
    }
    fingerprints.add(fingerprint);

    const id = newId();
    if (ids.has(id)) throw new Error(`Line ${row.line}: generated duplicate question ID.`);
    ids.add(id);
    let shareCode = '';
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const candidate = newShareCode();
      if (!codes.has(candidate)) {
        shareCode = candidate;
        break;
      }
    }
    if (!shareCode) throw new Error(`Line ${row.line}: could not generate a unique share code.`);
    codes.add(shareCode);

    const primary = categories[0]!;
    const sortOrder = row.sortOrder ?? (maxOrder.get(primary.id) ?? 0) + 10;
    for (const category of categories) {
      maxOrder.set(category.id, Math.max(maxOrder.get(category.id) ?? 0, sortOrder));
    }
    const question: Question = {
      id,
      optionA: row.optionA,
      optionB: row.optionB,
      status: row.status,
      shareCode,
      sortOrder,
      categoryIds: categories.map((category) => category.id),
      isDemo: row.isDemo,
      createdAt: now,
      updatedAt: now,
      publishedAt: row.status === 'published' ? now : null,
    };
    accepted.push(question);
    primarySlugById.set(id, primary.slug);
  }
  return { accepted, skippedDuplicates, primarySlugById };
}

async function validatePlan(dataset: JsonDataset, plan: ImportPlan): Promise<void> {
  const merged: JsonDataset = {
    categories: dataset.categories,
    questions: [...dataset.questions, ...plan.accepted],
  };
  const categories = await new JsonCategoryRepository(merged).getAllCategories();
  // Existing demo fixtures are valid in local editing; production builds still reject them.
  const issues = validateContent(categories, merged.questions, { allowDemoContent: true });
  if (hasErrors(issues))
    throw new Error(`Import would fail content validation:\n${formatIssues(issues)}`);
}

/** Stage touched category files and replace each only after the complete batch validates. */
export async function writeImportedQuestions(plan: ImportPlan, directory: string): Promise<void> {
  const bySlug = new Map<string, Question[]>();
  for (const question of plan.accepted) {
    const slug = plan.primarySlugById.get(question.id)!;
    const list = bySlug.get(slug) ?? [];
    list.push(question);
    bySlug.set(slug, list);
  }
  const staged: Array<{ temp: string; target: string; backup: string | null; committed: boolean }> =
    [];
  let successful = false;
  try {
    for (const [slug, questions] of bySlug) {
      const target = join(directory, 'questions', `${slug}.json`);
      const existing = existsSync(target)
        ? (JSON.parse(readFileSync(target, 'utf8')) as unknown)
        : [];
      if (!Array.isArray(existing)) throw new Error(`${target} must contain a JSON array.`);
      const temp = `${target}.${randomUUID()}.tmp`;
      const backup = existsSync(target) ? `${target}.${randomUUID()}.backup` : null;
      if (backup) copyFileSync(target, backup);
      staged.push({ temp, target, backup, committed: false });
      writeFileSync(
        temp,
        await format(JSON.stringify([...existing, ...questions]), {
          ...(await resolveConfig(target)),
          parser: 'json',
        }),
        {
          flag: 'wx',
        },
      );
    }
    for (const file of staged) {
      renameSync(file.temp, file.target);
      file.committed = true;
    }
    successful = true;
  } catch (error) {
    const failures: unknown[] = [error];
    for (const file of [...staged].reverse()) {
      if (!file.committed) continue;
      try {
        if (file.backup) renameSync(file.backup, file.target);
        else unlinkSync(file.target);
      } catch (rollbackError) {
        failures.push(rollbackError);
      }
    }
    if (failures.length > 1)
      throw new AggregateError(
        failures,
        'Import failed; rollback was incomplete. Restore the retained .backup files.',
        { cause: error },
      );
    successful = true;
    throw error;
  } finally {
    for (const { temp } of staged) if (existsSync(temp)) unlinkSync(temp);
    if (successful)
      for (const { backup } of staged) if (backup && existsSync(backup)) unlinkSync(backup);
  }
}

async function main(): Promise<void> {
  const file =
    argument('--file') ?? process.argv.find((value, index) => index > 1 && !value.startsWith('--'));
  if (!file) throw new Error('Usage: npm run import:csv -- --file ./questions.csv [--dry-run]');
  const rows = parseRows(readFileSync(resolve(file), 'utf8'));
  const dataset = await loadJsonDataset();
  const plan = planImport(rows, dataset);
  await validatePlan(dataset, plan);
  if (!process.argv.includes('--dry-run') && plan.accepted.length > 0) {
    await writeImportedQuestions(plan, CONTENT_DATA_DIRECTORY);
  }
  console.log(
    `${process.argv.includes('--dry-run') ? 'Dry run' : 'Import'} complete: ${plan.accepted.length} questions ${process.argv.includes('--dry-run') ? 'ready' : 'added'}, ${plan.skippedDuplicates} duplicates skipped.`,
  );
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(resolve(entryPath)).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
