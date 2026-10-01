#!/usr/bin/env node
/** Export the local JSON question catalog as a flat review-friendly file. */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { JsonDataset } from '../src/infrastructure/json/repositories';
import { loadJsonDataset } from '../src/infrastructure/json/repositories';
import { questionPairFingerprint } from '../src/lib/text';

export interface ExportQuestion {
  id: string;
  option_a: string;
  option_b: string;
  categories: string;
  status: string;
  share_code: string;
  sort_order: number;
  is_demo: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  fingerprint: string;
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function csvCell(value: string | number | boolean | null): string {
  if (value === null) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function asCsv(rows: readonly ExportQuestion[]): string {
  const columns: (keyof ExportQuestion)[] = [
    'id',
    'option_a',
    'option_b',
    'categories',
    'status',
    'share_code',
    'sort_order',
    'is_demo',
    'published_at',
    'created_at',
    'updated_at',
    'fingerprint',
  ];
  return `${columns.join(',')}\n${rows.map((row) => columns.map((column) => csvCell(row[column])).join(',')).join('\n')}\n`;
}

export function exportRows(dataset: JsonDataset): ExportQuestion[] {
  const slugById = new Map(dataset.categories.map((category) => [category.id, category.slug]));
  return dataset.questions
    .slice()
    .sort(
      (a, b) =>
        a.sortOrder - b.sortOrder ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.id.localeCompare(b.id),
    )
    .map((question) => ({
      id: question.id,
      option_a: question.optionA,
      option_b: question.optionB,
      categories: question.categoryIds.map((id) => slugById.get(id) ?? id).join('|'),
      status: question.status,
      share_code: question.shareCode,
      sort_order: question.sortOrder,
      is_demo: question.isDemo,
      published_at: question.publishedAt,
      created_at: question.createdAt,
      updated_at: question.updatedAt,
      fingerprint: questionPairFingerprint(question.optionA, question.optionB),
    }));
}

async function main(): Promise<void> {
  const format = argument('--format') ?? 'json';
  if (format !== 'json' && format !== 'csv') throw new Error('--format must be json or csv.');
  const rows = exportRows(await loadJsonDataset());
  const output = format === 'csv' ? asCsv(rows) : `${JSON.stringify(rows, null, 2)}\n`;
  const destination = argument('--out');
  if (destination) {
    const path = resolve(destination);
    writeFileSync(path, output, 'utf8');
    console.error(`Exported ${rows.length} questions to ${path}`);
  } else process.stdout.write(output);
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(resolve(entryPath)).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
