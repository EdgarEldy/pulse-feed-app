import { Provider } from '@angular/core';
import { Observable, of } from 'rxjs';
import {
  TranslateLoader,
  TranslationObject,
  provideTranslateLoader,
  provideTranslateParser,
  provideTranslateService,
} from '@ngx-translate/core';
import { IcuPluralTranslateParser } from '../core/i18n/icu-plural-translate-parser';
import enTranslations from '../../assets/i18n/en.json';

/**
 * Resolves synchronously with the app's real `en.json` content instead of
 * making an HTTP round trip, so specs get the real translation pipeline
 * (`TranslateService`/`TranslatePipe`, including the app's ICU-plural
 * parser for `likes.count`/`comments.count`) without needing an
 * `HttpTestingController` flush in every spec that renders translated
 * text.
 */
class StaticTranslateLoader implements TranslateLoader {
  getTranslation(): Observable<TranslationObject> {
    return of(enTranslations as TranslationObject);
  }
}

/**
 * Test-only equivalent of `app.config.ts`'s `provideTranslateService(...)`
 * call: the real service, the real ICU-plural-aware parser, and the real
 * English copy, just swapping the HTTP-backed loader for a synchronous one.
 * Specs that assert on rendered/translated text keep asserting against the
 * genuine production strings; specs that only need `TranslateService` to be
 * injectable get it for free with no extra bookkeeping.
 */
export function provideTestTranslations(): Provider[] {
  return provideTranslateService({
    lang: 'en',
    fallbackLang: 'en',
    loader: provideTranslateLoader(StaticTranslateLoader),
    parser: provideTranslateParser(IcuPluralTranslateParser),
  });
}
