import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { writeImportedQuestions } from '../../tools/import-csv';
import { loadJsonDataset } from '@/infrastructure/json/repositories';

const failure = vi.hoisted(() => ({ destination: '' }));
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    renameSync: (source: string, destination: string) => {
      if (destination === failure.destination && source.endsWith('.tmp'))
        throw new Error('Simulated replacement failure');
      return actual.renameSync(source, destination);
    },
  };
});

const question = (await loadJsonDataset()).questions[0]!;
const directories: string[] = [];
function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'wyr-import-'));
  directories.push(directory);
  mkdirSync(join(directory, 'questions'));
  const original = JSON.stringify([question]);
  for (const slug of ['one', 'two'])
    writeFileSync(join(directory, 'questions', `${slug}.json`), original);
  const first = { ...question, id: 'import-one', shareCode: 'impone1' };
  const second = { ...question, id: 'import-two', shareCode: 'imptwo2' };
  const plan = {
    accepted: [first, second],
    skippedDuplicates: 0,
    primarySlugById: new Map([
      [first.id, 'one'],
      [second.id, 'two'],
    ]),
  };
  return { directory, original, plan };
}
afterEach(() => {
  failure.destination = '';
  for (const directory of directories.splice(0)) {
    if (!resolve(directory).startsWith(resolve(tmpdir()) + sep))
      throw new Error('Unsafe test cleanup path');
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('CSV import recovery', () => {
  it('preserves original content and commits the complete batch without leftover staging files', async () => {
    const { directory, plan } = setup();
    await writeImportedQuestions(plan, directory);
    for (const [index, slug] of ['one', 'two'].entries()) {
      expect(
        JSON.parse(readFileSync(join(directory, 'questions', `${slug}.json`), 'utf8')),
      ).toEqual([question, plan.accepted[index]]);
    }
    expect(readdirSync(join(directory, 'questions')).sort()).toEqual(['one.json', 'two.json']);
  });
  it('restores a completed replacement if a later file fails', async () => {
    const { directory, original, plan } = setup();
    failure.destination = join(directory, 'questions', 'two.json');
    await expect(writeImportedQuestions(plan, directory)).rejects.toThrow(
      'Simulated replacement failure',
    );
    for (const slug of ['one', 'two'])
      expect(readFileSync(join(directory, 'questions', `${slug}.json`), 'utf8')).toBe(original);
    expect(readdirSync(join(directory, 'questions')).sort()).toEqual(['one.json', 'two.json']);
  });
});
