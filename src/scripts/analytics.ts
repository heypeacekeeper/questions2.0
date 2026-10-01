/**
 * Client analytics bootstrap: consent-gated loading + privacy-conscious
 * monitoring hooks (Core Web Vitals, JS errors, API timings). Configuration is
 * injected via data-* attributes on the <script> host element so no IDs are
 * hardcoded and nothing loads in development.
 */
import {
  CONSENT_EVENT,
  CookieConsentStore,
  type ConsentState,
} from '@/infrastructure/consent/consent-store';
import {
  CloudflareWebAnalyticsProvider,
  CompositeAnalytics,
  GoogleAnalytics4Provider,
} from '@/infrastructure/analytics/providers';
import type { AnalyticsEventName } from '@/repositories/interfaces';
import { onCLS, onINP, onLCP, type Metric } from 'web-vitals';

export interface AnalyticsConfig {
  ga4Id: string | null;
  cfToken: string | null;
  /** Load Cloudflare Web Analytics only after analytics consent (default: no). */
  cfRequiresConsent: boolean;
}

type Params = Record<string, string | number | boolean>;

let composite: CompositeAnalytics | null = null;
let analyticsAllowed = false;

/** Global, safe tracking entry point used by the game and forms. */
export function track(event: AnalyticsEventName, params: Params = {}): void {
  if (!analyticsAllowed) return;
  composite?.track(event, sanitize(params));
}

/** Whitelist parameter keys and clamp values so PII can't leak by accident. */
function sanitize(params: Params): Params {
  const allowed = new Set([
    'category',
    'choice',
    'status',
    'endpoint',
    'ms',
    'name',
    'value',
    'rating',
    'code',
    'source',
  ]);
  const out: Params = {};
  for (const [k, v] of Object.entries(params)) {
    if (!allowed.has(k)) continue;
    out[k] = typeof v === 'string' ? v.slice(0, 60) : v;
  }
  return out;
}

export function initAnalytics(config: AnalyticsConfig): void {
  if (composite) return;
  const providers = [];
  if (config.ga4Id) providers.push(new GoogleAnalytics4Provider(config.ga4Id));
  if (config.cfToken) {
    const cf = new CloudflareWebAnalyticsProvider(config.cfToken);
    if (config.cfRequiresConsent) Object.defineProperty(cf, 'requiresConsent', { value: true });
    providers.push(cf);
  }
  if (providers.length === 0) return;
  composite = new CompositeAnalytics(providers);

  composite.loadConsentFree();
  const store = new CookieConsentStore();
  const apply = (state: ConsentState) => {
    analyticsAllowed = state.decided && state.analytics;
    if (config.ga4Id) {
      (window as unknown as Record<string, unknown>)[`ga-disable-${config.ga4Id}`] =
        !analyticsAllowed;
      window.gtag?.('consent', 'update', {
        analytics_storage: analyticsAllowed ? 'granted' : 'denied',
      });
    }
    if (analyticsAllowed) composite?.loadConsented();
  };
  apply(store.read());
  document.addEventListener(CONSENT_EVENT, (e) => apply((e as CustomEvent<ConsentState>).detail));

  installMonitoring();
}

function installMonitoring(): void {
  // JS errors (message only — no stack, no URLs with query strings).
  window.addEventListener('error', (e) => {
    track('js_error', { name: String(e.message ?? 'error').slice(0, 60) });
  });
  window.addEventListener('unhandledrejection', () =>
    track('js_error', { name: 'unhandledrejection' }),
  );

  // Report standard page-level metrics; track() retains consent/provider gating.
  try {
    const report = ({ name, value }: Metric) =>
      track('web_vital', { name, value: Math.round(value * 1000) / 1000 });
    onCLS(report);
    onINP(report);
    onLCP(report);
  } catch {
    /* unsupported browser */
  }
}
