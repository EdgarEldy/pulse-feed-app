import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { AppComponent } from './app.component';
import { routes } from './app.routes';
import { AuthService, AuthState } from './features/auth/auth.service';

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
        { provide: AuthService, useValue: new FakeAuthenticatedAuthService() },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('boots the app shell and renders the placeholder feed page for the default route when signed in', async () => {
    const fixture = TestBed.createComponent(AppComponent);

    const router = TestBed.inject(Router);
    await router.navigateByUrl('');

    fixture.detectChanges();

    const shell = fixture.nativeElement as HTMLElement;
    expect(shell.querySelector('ion-router-outlet')).toBeTruthy();
    expect(shell.textContent).toContain('Feed');
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
        { provide: AuthService, useValue: new FakeUnauthenticatedAuthService() },
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
