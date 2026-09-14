import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { TranslateLoader } from '@ngx-translate/core';
import { Observable } from 'rxjs';

/**
 * Fetches `assets/i18n/<lang>.json` for the language `TranslateService`
 * asks for, so translation strings ship as plain static files instead of
 * being baked into the JS bundle per locale.
 *
 * `@ngx-translate/core` only defines the `TranslateLoader` contract; it
 * deliberately does not ship an HTTP-backed implementation itself (that
 * lives in the separate `@ngx-translate/http-loader` package). Since
 * README's Tech Stack table lists only `@ngx-translate/core`, this is a
 * small hand-written loader instead of pulling in that extra dependency:
 * the loader does nothing more than what the companion package's loader
 * does internally, a single `HttpClient.get` per language file.
 *
 * `HttpClient` is used directly here rather than through
 * `BaseApiService`: `BaseApiService` exists to talk to the backend REST
 * API (base URL prefixing, `zod` validation, `AppError` mapping), none
 * of which applies to reading a static JSON asset bundled with the app.
 */
@Injectable()
export class AppTranslateLoader implements TranslateLoader {
  private readonly http = inject(HttpClient);

  getTranslation(lang: string): Observable<Record<string, string>> {
    return this.http.get<Record<string, string>>(`assets/i18n/${lang}.json`);
  }
}
