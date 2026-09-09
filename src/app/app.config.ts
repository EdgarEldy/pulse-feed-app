import { ApplicationConfig } from '@angular/core';
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
import { AppTranslateLoader } from './core/i18n/app-translate-loader';

/**
 * Centralizes every top-level provider the app needs to bootstrap: the router,
 * Ionic's Angular integration, and HttpClient. Keeping this separate from
 * main.ts is what lets a later branch (feature/auth) add the auth interceptor
 * and an APP_INITIALIZER here without touching the bootstrap call itself.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    provideRouter(routes, withPreloading(PreloadAllModules), withComponentInputBinding()),
    provideHttpClient(withInterceptors([])),
    // `provideTranslateService` requires `provideHttpClient` above to already
    // be registered, since `AppTranslateLoader` injects `HttpClient` to fetch
    // `assets/i18n/<lang>.json`. English is both the starting language and
    // the fallback used when a key is missing in the active language.
    provideTranslateService({
      lang: 'en',
      fallbackLang: 'en',
      loader: provideTranslateLoader(AppTranslateLoader),
    }),
  ],
};
