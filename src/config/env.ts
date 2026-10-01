/** Validated build configuration for the file-backed content site. */
import { SITE_URL } from './site-static.mjs';

export type RawEnv = Record<string, string | undefined>;

export interface FeatureFlags {
  readonly FEATURE_ADS: boolean;
  readonly FEATURE_GA4: boolean;
  readonly FEATURE_CLOUDFLARE_ANALYTICS: boolean;
}

export interface AppEnv {
  readonly mode: string;
  readonly isProduction: boolean;
  readonly siteUrl: string;
  readonly dataProvider: 'json';
  readonly ga4MeasurementId: string | undefined;
  readonly cloudflareAnalyticsToken: string | undefined;
  readonly searchConsoleVerification: string | undefined;
  readonly adsensePublisherId: string | undefined;
  readonly features: FeatureFlags;
  /** Demo questions can be used for local previews, never silently in a release build. */
  readonly allowDemoContent: boolean;
}

export class EnvValidationError extends Error {
  constructor(public readonly problems: readonly string[]) {
    super(`Invalid environment configuration:\n - ${problems.join('\n - ')}`);
    this.name = 'EnvValidationError';
  }
}

function parseBool(
  value: string | undefined,
  fallback: boolean,
  name: string,
  problems: string[],
): boolean {
  if (value === undefined || value.trim() === '') return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  problems.push(
    `${name} must be a boolean value: true/false, 1/0, yes/no, or on/off (received "${value}")`,
  );
  return fallback;
}

function trimOrUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

export function buildAppEnv(
  raw: RawEnv,
  options: { mode?: string; context?: 'build' | 'worker' | 'tool' } = {},
): AppEnv {
  const mode = options.mode ?? raw.NODE_ENV ?? raw.MODE ?? 'production';
  const isProduction = mode === 'production';
  const problems: string[] = [];
  const bool = (name: string, fallback: boolean) => parseBool(raw[name], fallback, name, problems);
  const siteUrl = (trimOrUndefined(raw.PUBLIC_SITE_URL) ?? SITE_URL).replace(/\/+$/, '');

  try {
    const url = new URL(siteUrl);
    if (isProduction && url.protocol !== 'https:') {
      problems.push('PUBLIC_SITE_URL must use https in production');
    }
  } catch {
    problems.push(`PUBLIC_SITE_URL is not a valid URL: "${siteUrl}"`);
  }

  const features: FeatureFlags = {
    FEATURE_ADS: bool('FEATURE_ADS', false),
    FEATURE_GA4: bool('FEATURE_GA4', false),
    FEATURE_CLOUDFLARE_ANALYTICS: bool('FEATURE_CLOUDFLARE_ANALYTICS', false),
  };
  const ga4MeasurementId = trimOrUndefined(raw.PUBLIC_GA4_MEASUREMENT_ID);
  const cloudflareAnalyticsToken = trimOrUndefined(raw.PUBLIC_CLOUDFLARE_ANALYTICS_TOKEN);
  const searchConsoleVerification = trimOrUndefined(raw.PUBLIC_SEARCH_CONSOLE_VERIFICATION);
  const adsensePublisherId = trimOrUndefined(raw.PUBLIC_ADSENSE_PUBLISHER_ID);
  const allowDemoContent = bool('ALLOW_DEMO_CONTENT', false);

  if (features.FEATURE_GA4 && !ga4MeasurementId) {
    problems.push('PUBLIC_GA4_MEASUREMENT_ID is required when FEATURE_GA4=true');
  }
  if (features.FEATURE_CLOUDFLARE_ANALYTICS && !cloudflareAnalyticsToken) {
    problems.push(
      'PUBLIC_CLOUDFLARE_ANALYTICS_TOKEN is required when FEATURE_CLOUDFLARE_ANALYTICS=true',
    );
  }
  if (features.FEATURE_ADS && !adsensePublisherId) {
    problems.push('PUBLIC_ADSENSE_PUBLISHER_ID is required when FEATURE_ADS=true');
  }
  if (isProduction && features.FEATURE_ADS)
    problems.push(
      'Advertising is not launch-ready. Keep FEATURE_ADS=false until responsive slots and the consent integration are completed and verified.',
    );
  if (adsensePublisherId && !/^ca-pub-\d{10,20}$/.test(adsensePublisherId)) {
    problems.push('PUBLIC_ADSENSE_PUBLISHER_ID must look like ca-pub-XXXXXXXXXXXXXXXX');
  }
  if (problems.length > 0) throw new EnvValidationError(problems);

  return Object.freeze({
    mode,
    isProduction,
    siteUrl,
    dataProvider: 'json',
    ga4MeasurementId,
    cloudflareAnalyticsToken,
    searchConsoleVerification,
    adsensePublisherId,
    features,
    allowDemoContent,
  });
}

export function readProcessEnv(): RawEnv {
  return { ...(typeof process !== 'undefined' ? process.env : {}) } as RawEnv;
}

/** Astro/Vite inlines direct property reads into prerender chunks. */
export function readImportMetaEnv(): RawEnv {
  if (!import.meta.env) return {};
  const values: RawEnv = {
    MODE: import.meta.env.MODE,
    ASTRO_MODE: import.meta.env.MODE,
    ALLOW_DEMO_CONTENT: import.meta.env.ALLOW_DEMO_CONTENT,
    PUBLIC_SITE_URL: import.meta.env.PUBLIC_SITE_URL,
    FEATURE_ADS: import.meta.env.FEATURE_ADS,
    FEATURE_GA4: import.meta.env.FEATURE_GA4,
    FEATURE_CLOUDFLARE_ANALYTICS: import.meta.env.FEATURE_CLOUDFLARE_ANALYTICS,
    PUBLIC_GA4_MEASUREMENT_ID: import.meta.env.PUBLIC_GA4_MEASUREMENT_ID,
    PUBLIC_CLOUDFLARE_ANALYTICS_TOKEN: import.meta.env.PUBLIC_CLOUDFLARE_ANALYTICS_TOKEN,
    PUBLIC_SEARCH_CONSOLE_VERIFICATION: import.meta.env.PUBLIC_SEARCH_CONSOLE_VERIFICATION,
    PUBLIC_ADSENSE_PUBLISHER_ID: import.meta.env.PUBLIC_ADSENSE_PUBLISHER_ID,
  };
  return Object.fromEntries(
    Object.entries(values).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

let cachedBuildEnv: AppEnv | undefined;

export function getBuildEnv(): AppEnv {
  if (!cachedBuildEnv) {
    const raw = { ...readProcessEnv(), ...readImportMetaEnv() };
    cachedBuildEnv = buildAppEnv(raw, {
      mode: raw.NODE_ENV ?? raw.ASTRO_MODE ?? 'production',
      context: 'build',
    });
  }
  return cachedBuildEnv;
}

/** Tests only. */
export function __resetEnvCache(): void {
  cachedBuildEnv = undefined;
}
