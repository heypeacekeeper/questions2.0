/**
 * Provider-independent repository and service interfaces (the "ports").
 *
 * Adapters live in `src/infrastructure/*`. UI, services, and game code depend
 * only on these interfaces and the domain types.
 */
import type { Category, CategoryWithCount } from '@/domain/category';
import type { Question } from '@/domain/question';

// ---------------------------------------------------------------------------
// Content (read at build time)
// ---------------------------------------------------------------------------

export interface QuestionRepository {
  /** All published questions, ordered by sort_order then created_at. */
  getPublishedQuestions(): Promise<readonly Question[]>;
  /** Published questions that belong to the given category id. */
  getQuestionsByCategory(categoryId: string): Promise<readonly Question[]>;
  /** Any status — share routes must handle archived questions gracefully. */
  getQuestionByShareCode(shareCode: string): Promise<Question | null>;
  /** Every question regardless of status (content validation, exports). */
  getAllQuestions(): Promise<readonly Question[]>;
}

export interface CategoryRepository {
  /** Published categories with counts (may include zero-count categories; services filter). */
  getPublishedCategories(): Promise<readonly CategoryWithCount[]>;
  /** Published categories flagged nav_featured, ordered. */
  getNavigationCategories(): Promise<readonly CategoryWithCount[]>;
  /** Published categories that have a seasonal window (config or record). */
  getSeasonalCategories(): Promise<readonly CategoryWithCount[]>;
  /** Every category regardless of status (content validation). */
  getAllCategories(): Promise<readonly CategoryWithCount[]>;
}

export type AnalyticsEventName =
  'question_advanced' | 'pack_changed' | 'share_clicked' | 'js_error' | 'web_vital';

export interface AnalyticsProvider {
  readonly id: string;
  /** Whether the provider requires explicit analytics consent before loading. */
  readonly requiresConsent: boolean;
  /** Called client-side once consent (if required) is granted. */
  load(): void;
  /** Must never receive personal data or full question text. */
  track(event: AnalyticsEventName, params?: Record<string, string | number | boolean>): void;
}

/** Convenience bundle returned by the composition root. */
export interface ContentRepositories {
  readonly questions: QuestionRepository;
  readonly categories: CategoryRepository;
}

export type { Category, CategoryWithCount, Question };
