import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { AppComponent } from './app.component';
import { routes } from './app.routes';
import { AppDatabaseService, SqlExecutor } from './core/database/app-database.service';
import { AuthService, AuthState } from './features/auth/auth.service';

/**
 * `FeedPage` (default route once `feature/posts` landed) constructs
 * `PostsService` on injection, which constructs `PostsLocalService`, which
 * calls `AppDatabaseService.ready()`. The real service's constructor
 * bootstraps the actual `jeep-sqlite` web component and fetches its wasm
 * binary, something Karma's test server does not serve, hanging the whole
 * suite. This app-shell smoke test does not care what `posts_cache` holds,
 * only that the router/guard mechanics work, so it never needs the real
 * database, just something that resolves `ready()` without doing any of
 * that.
 */
class FakeAppDatabaseService {
  private readonly executor: SqlExecutor = {
    query: async () => [],
    run: async () => undefined,
  };

  ready(): Promise<SqlExecutor> {
    return Promise.resolve(this.executor);
  }
}

/**
 * `authGuard` now sits in front of the `feed`/`posts`/`profile/:id` routes,
 * so a test that navigates to the default route and expects the feed
 * placeholder to render needs a signed-in `AuthService` to get past it.
 * Real `AuthService`'s `isAuthenticated` starts `false` until a session is
 * restored, which would otherwise send this test to `/login` instead of the
 * route it means to exercise.
 *
 * `authState` is also stubbed even though this describe block never
 * navigates to `/login`: it stays here for symmetry with the unauthenticated
 * fake below and so any future test in this file that does route to
 * `LoginPage`/`RegisterPage` (both read `AuthService.authState` in a
 * constructor `effect()`) does not fail with the same "not a function" error
 * the unauthenticated fake originally hit.
 */
class FakeAuthenticatedAuthService {
  private readonly stateSignal = signal<AuthState>({ status: 'idle' });
  readonly authState = this.stateSignal.asReadonly();

  isAuthenticated(): boolean {
    return true;
  }

  resetState(): void {
    this.stateSignal.set({ status: 'idle' });
  }
}

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideIonicAngular(),
        provideRouter(routes, withComponentInputBinding()),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: new FakeAuthenticatedAuthService() },
        { provide: AppDatabaseService, useValue: new FakeAppDatabaseService() },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('boots the app shell and routes to the feed for the default path when signed in', async () => {
    const fixture = TestBed.createComponent(AppComponent);

    const router = TestBed.inject(Router);
    await router.navigateByUrl('');

    fixture.detectChanges();

    // FeedPage itself (its data loading, its rendered content) has its own
    // dedicated spec; this test only cares that the app shell boots and the
    // '' -> 'feed' redirect actually resolves past authGuard, not what
    // FeedPage does with the (unmocked, intentionally never-flushed) HTTP
    // call it fires on init.
    const shell = fixture.nativeElement as HTMLElement;
    expect(shell.querySelector('ion-router-outlet')).toBeTruthy();
    expect(router.url).toBe('/feed');
  });
});

describe('AppComponent (unauthenticated)', () => {
  class FakeUnauthenticatedAuthService {
    private readonly stateSignal = signal<AuthState>({ status: 'idle' });
    readonly authState = this.stateSignal.asReadonly();

    isAuthenticated(): boolean {
      return false;
    }

    resetState(): void {
      this.stateSignal.set({ status: 'idle' });
    }
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideIonicAngular(),
        provideRouter(routes, withComponentInputBinding()),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: new FakeUnauthenticatedAuthService() },
        { provide: AppDatabaseService, useValue: new FakeAppDatabaseService() },
      ],
    }).compileComponents();
  });

  it('redirects to the login page for the default route when no session is present', async () => {
    const fixture = TestBed.createComponent(AppComponent);

    const router = TestBed.inject(Router);
    await router.navigateByUrl('');

    fixture.detectChanges();

    expect(router.url).toBe('/login');
  });
});
