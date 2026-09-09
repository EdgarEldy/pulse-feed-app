import { ApplicationConfig, inject, provideAppInitializer } from '@angular/core';
import {
  RouteReuseStrategy,
  provideRouter,
  withComponentInputBinding,
  withPreloading,
  PreloadAllModules,
} from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';
import { provideTranslateService, provideTranslateLoader } from '@ngx-translate/core';

import { routes } from './app.routes';
import { authInterceptor } from './core/http/auth.interceptor';
import { AppTranslateLoader } from './core/i18n/app-translate-loader';
import { AuthService } from './features/auth/auth.service';

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
    provideIonicAngular(),
    provideRouter(routes, withPreloading(PreloadAllModules), withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor])),
    // `provideTranslateService` requires `provideHttpClient` above to already
    // be registered, since `AppTranslateLoader` injects `HttpClient` to fetch
    // `assets/i18n/<lang>.json`. English is both the starting language and
    // the fallback used when a key is missing in the active language.
    provideTranslateService({
      lang: 'en',
      fallbackLang: 'en',
      loader: provideTranslateLoader(AppTranslateLoader),
    }),
    // Restores `AuthService.currentUser` from stored tokens before the app
    // renders its first route (README's Auth Model: "an APP_INITIALIZER
    // reads the stored tokens; if present and valid, restores the
    // authenticated state before the app renders its first route"). Angular
    // runs every `provideAppInitializer` factory, awaiting any returned
    // Promise, before bootstrapping proceeds, so `authGuard` never sees a
    // still-loading, not-yet-restored session on the very first navigation.
    provideAppInitializer(() => {
      const authService = inject(AuthService);
      return authService.restoreSession();
    }),
  ],
};
