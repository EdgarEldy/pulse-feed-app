import { ApplicationConfig, inject, provideAppInitializer } from '@angular/core';
import {
  RouteReuseStrategy,
  provideRouter,
  withComponentInputBinding,
  withPreloading,
  PreloadAllModules,
} from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';
import { firstValueFrom } from 'rxjs';
import { provideTranslateService, provideTranslateLoader, TranslateService } from '@ngx-translate/core';

import { routes } from './app.routes';
import { authInterceptor } from './core/http/auth.interceptor';
import { AppTranslateLoader } from './core/i18n/app-translate-loader';
import { TRANSLATE_CONFIG_BASE } from './core/i18n/translate-config';
import { AuthService } from './features/auth/auth.service';
import { postHeroTransition } from './features/posts/post-hero-transition.util';

/**
 * Centralizes every top-level provider the app needs to bootstrap: the
 * router, Ionic's Angular integration, HttpClient (with the auth
 * interceptor), translations, and the session-restoration app initializer.
 * Keeping this separate from main.ts is what lets bootstrap stay a
 * one-liner while every provider a later branch needs is added here
 * instead.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    // `navAnimation` is Ionic's one app-wide hook for customizing
    // `ion-router-outlet`'s page transition (see
    // `post-hero-transition.util.ts` for exactly what this does and does
    // not achieve versus a true shared-element transition). It delegates to
    // the platform's normal iOS/MD transition for every navigation that
    // isn't a feed-thumbnail-to-post-detail pair, so this is additive, not
    // a replacement of the app's default navigation feel.
    provideIonicAngular({ navAnimation: postHeroTransition }),
    provideRouter(routes, withPreloading(PreloadAllModules), withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor])),
    // Enables the `@angular/animations` DSL (`trigger`/`transition`) used
    // by, among others, `PostCardComponent`'s entry animation. The async
    // variant loads the animation renderer lazily on first use instead of
    // bundling it into the initial chunk, which is why this is
    // `provideAnimationsAsync()` rather than the eager `provideAnimations()`.
    provideAnimationsAsync(),
    // `provideTranslateService` requires `provideHttpClient` above to already
    // be registered, since `AppTranslateLoader` injects `HttpClient` to fetch
    // `assets/i18n/<lang>.json`. `TRANSLATE_CONFIG_BASE` (lang, fallbackLang,
    // the ICU-plural parser) is shared with the test-only equivalent of this
    // call in `testing/translate-testing.ts`, so only the loader differs
    // between production and specs.
    provideTranslateService({
      ...TRANSLATE_CONFIG_BASE,
      loader: provideTranslateLoader(AppTranslateLoader),
    }),
    // Restores `AuthService.currentUser` from stored tokens before the app
    // renders its first route (README's Auth Model: "an APP_INITIALIZER
    // reads the stored tokens; if present and valid, restores the
    // authenticated state before the app renders its first route"). Angular
    // runs every `provideAppInitializer` factory, awaiting any returned
    // Promise, before bootstrapping proceeds, so `authGuard` never sees a
    // still-loading, not-yet-restored session on the very first navigation.
    //
    // Waits for `assets/i18n/en.json` to finish loading first, in the same
    // initializer rather than a separate one (Angular runs every
    // `provideAppInitializer` concurrently, not in declaration order, so a
    // second initializer alone would not guarantee this ordering): without
    // it, a slow network could still have the translation fetch in flight
    // when `restoreSession()` hits an error path that calls
    // `TranslateService.instant(...)` to build a translated `AppError`
    // message (an expired/invalid stored session, or no refresh token at
    // all), silently rendering the raw key instead of real text on a cold
    // start instead of the intended message.
    provideAppInitializer(async () => {
      const translate = inject(TranslateService);
      const authService = inject(AuthService);
      await firstValueFrom(translate.use(translate.currentLang() ?? 'en'));
      await authService.restoreSession();
    }),
  ],
};
