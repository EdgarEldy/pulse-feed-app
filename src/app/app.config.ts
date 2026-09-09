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

import { routes } from './app.routes';

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
  ],
};
