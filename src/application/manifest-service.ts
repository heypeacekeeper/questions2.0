/** Non-secret deployment manifest (build metadata + content checksum). */
import type { DeploymentManifest } from '@/domain/site';
import type { CategoryWithCount } from '@/domain/category';
import type { Question } from '@/domain/question';
import { sha256Hex } from '@/lib/crypto';

export async function computeContentChecksum(
  categories: readonly CategoryWithCount[],
  questions: readonly Question[],
  articles: readonly { id: string; body: string; data: Record<string, unknown> }[] = [],
): Promise<string> {
  const cats = categories
    .filter((c) => c.status === 'published')
    .map((c) => ({ ...c }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const qs = questions
    .filter((q) => q.status === 'published')
    .map((q) => ({ ...q, categoryIds: [...q.categoryIds].sort() }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const canonical = (value: unknown): unknown => {
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => [key, canonical(item)]),
      );
    return value;
  };
  return sha256Hex(
    JSON.stringify(
      canonical({
        categories: cats,
        questions: qs,
        articles: [...articles].sort((a, b) => a.id.localeCompare(b.id)),
      }),
    ),
  );
}

export async function buildDeploymentManifest(input: {
  categories: readonly CategoryWithCount[];
  questions: readonly Question[];
  appVersion: string;
  gitCommit: string | null;
  dataProvider: string;
  now?: Date;
  articles?: readonly { id: string; body: string; data: Record<string, unknown> }[];
}): Promise<DeploymentManifest> {
  return {
    buildTimestamp: (input.now ?? new Date()).toISOString(),
    gitCommit: input.gitCommit,
    appVersion: input.appVersion,
    dataProvider: input.dataProvider,
    publishedQuestionCount: input.questions.filter((q) => q.status === 'published').length,
    publishedCategoryCount: input.categories.filter(
      (c) => c.status === 'published' && c.publishedQuestionCount > 0,
    ).length,
    contentChecksum: await computeContentChecksum(
      input.categories,
      input.questions,
      input.articles,
    ),
  };
}
