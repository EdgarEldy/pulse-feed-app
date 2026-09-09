import { Signal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { AuthService, AuthState } from '../../auth.service';
import { LoginPage } from './login.page';

class FakeAuthService {
  private readonly stateSignal = signal<AuthState>({ status: 'idle' });
  readonly authState: Signal<AuthState> = this.stateSignal.asReadonly();
  readonly signIn = jasmine.createSpy('signIn');

  setState(state: AuthState): void {
    this.stateSignal.set(state);
  }

  resetState(): void {
    this.stateSignal.set({ status: 'idle' });
  }
}

describe('LoginPage', () => {
  let fixture: ComponentFixture<LoginPage>;
  let component: LoginPage;
  let fakeAuthService: FakeAuthService;
  let router: Router;

  beforeEach(async () => {
    fakeAuthService = new FakeAuthService();

    await TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [provideIonicAngular(), provideRouter([]), { provide: AuthService, useValue: fakeAuthService }],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginPage);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    fixture.detectChanges();
  });

  it('shows a validation error and does not call signIn when submitting the form empty', () => {
    const form = fixture.debugElement.query(By.css('form'));
    form.triggerEventHandler('ngSubmit', null);
    fixture.detectChanges();

    const errors = fixture.debugElement.queryAll(By.css('.field-error'));
    expect(errors.length).toBeGreaterThan(0);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Email is required.');
    expect(fakeAuthService.signIn).not.toHaveBeenCalled();
  });

  it('navigates to the feed once signIn resolves successfully', () => {
    spyOn(router, 'navigateByUrl');

    component.form.setValue({ email: 'ada@example.com', password: 'password123' });
    const form = fixture.debugElement.query(By.css('form'));
    form.triggerEventHandler('ngSubmit', null);
    fixture.detectChanges();

    expect(fakeAuthService.signIn).toHaveBeenCalledWith('ada@example.com', 'password123');
    expect(router.navigateByUrl).not.toHaveBeenCalled();

    fakeAuthService.setState({ status: 'success' });
    TestBed.tick();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/feed');
  });

  it('clears a stale error left by a previous attempt on the other auth page', () => {
    // Simulates arriving at /login right after a failed RegisterPage
    // attempt: authState is a signal shared by both pages, so without the
    // constructor's resetState() call this fresh LoginPage instance would
    // immediately show the previous page's leftover error toast.
    fakeAuthService.setState({ status: 'error', error: { kind: 'server', message: 'Email already in use.', statusCode: 409 } });

    const freshFixture = TestBed.createComponent(LoginPage);
    freshFixture.detectChanges();

    expect(freshFixture.componentInstance.toastOpen()).toBeFalse();
  });

  it('shows a toast with the error message when signIn fails', () => {
    component.form.setValue({ email: 'ada@example.com', password: 'password123' });
    const form = fixture.debugElement.query(By.css('form'));
    form.triggerEventHandler('ngSubmit', null);

    fakeAuthService.setState({ status: 'error', error: { kind: 'unauthorized', message: 'Invalid credentials.' } });
    TestBed.tick();
    fixture.detectChanges();

    expect(component.toastOpen()).toBeTrue();
    expect(component.toastMessage()).toBe('Invalid credentials.');
  });
});
