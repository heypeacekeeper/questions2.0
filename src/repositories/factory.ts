/** Build-time composition root for the JSON question catalogue. */
import type { AppEnv } from '@/config/env';
import { getBuildEnv } from '@/config/env';
import type { ContentRepositories } from '@/repositories/interfaces';
import { CategoryService } from '@/application/category-service';
import { QuestionService } from '@/application/question-service';
import {
  loadJsonDataset,
  JsonQuestionRepository,
  JsonCategoryRepository,
} from '@/infrastructure/json/repositories';

export interface ContentContext extends ContentRepositories {
  readonly env: AppEnv;
  readonly questionService: QuestionService;
  readonly categoryService: CategoryService;
}

let contentContextPromise: Promise<ContentContext> | undefined;

/** JSON is read once in Node during prerendering. */
export async function createContentRepositories(_env: AppEnv): Promise<ContentRepositories> {
  const dataset = await loadJsonDataset();
  return {
    questions: new JsonQuestionRepository(dataset),
    categories: new JsonCategoryRepository(dataset),
  };
}

/** Memoized context used by Astro pages during prerendering. */
export function getContentContext(): Promise<ContentContext> {
  contentContextPromise ??= (async () => {
    const env = getBuildEnv();
    const repos = await createContentRepositories(env);
    return {
      env,
      ...repos,
      questionService: new QuestionService(repos.questions),
      categoryService: new CategoryService(repos.categories),
    };
  })();
  return contentContextPromise;
}

/** Tests only. */
export function __resetContentContext(): void {
  contentContextPromise = undefined;
}
