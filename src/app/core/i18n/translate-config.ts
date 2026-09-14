import { provideTranslateParser } from '@ngx-translate/core';
import { IcuPluralTranslateParser } from './icu-plural-translate-parser';

/**
 * Every part of `provideTranslateService(...)`'s config that is not the
 * loader: shared between `app.config.ts` (the real, `HttpClient`-backed
 * loader) and `src/app/testing/translate-testing.ts` (a synchronous
 * test-only loader), so the two configurations cannot silently drift apart
 * (a new option added to production config, an app-wide language change)
 * without both picking it up automatically.
 */
export const TRANSLATE_CONFIG_BASE = {
  lang: 'en',
  fallbackLang: 'en',
  // The comments/likes counters use ICU plural syntax
  // (`{count, plural, =0 {...} other {...}}`), which the default parser
  // does not understand; see `IcuPluralTranslateParser`'s doc comment for
  // why this is a small custom parser rather than an added MessageFormat
  // dependency.
  parser: provideTranslateParser(IcuPluralTranslateParser),
};
