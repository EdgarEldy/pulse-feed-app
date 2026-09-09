import { Signal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { AuthService, AuthState } from '../../auth.service';
import { RegisterPage } from './register.page';

class FakeAuthService {
  private readonly stateSignal = signal<AuthState>({ status: 'idle' });
  readonly authState: Signal<AuthState> = this.stateSignal.asReadonly();
  readonly register = jasmine.createSpy('register');

  setState(state: AuthState): void {
    this.stateSignal.set(state);
  }

  resetState(): void {
    this.stateSignal.set({ status: 'idle' });
  }
}

describe('RegisterPage', () => {
  let fixture: ComponentFixture<RegisterPage>;
  let component: RegisterPage;
  let fakeAuthService: FakeAuthService;
  let router: Router;

  beforeEach(async () => {
    fakeAuthService = new FakeAuthService();

    await TestBed.configureTestingModule({
      imports: [RegisterPage],
      providers: [provideIonicAngular(), provideRouter([]), { provide: AuthService, useValue: fakeAuthService }],
    }).compileComponents();

    fixture = TestBed.createComponent(RegisterPage);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    fixture.detectChanges();
  });

  it('shows a validation error and does not call register when submitting the form empty', () => {
    const form = fixture.debugElement.query(By.css('form'));
    form.triggerEventHandler('ngSubmit', null);
    fixture.detectChanges();

    const errors = fixture.debugElement.queryAll(By.css('.field-error'));
    expect(errors.length).toBeGreaterThan(0);
    expect(fakeAuthService.register).not.toHaveBeenCalled();
  });

  it('navigates to the feed once register resolves successfully', () => {
    spyOn(router, 'navigateByUrl');

    component.form.setValue({ displayName: 'Ada Lovelace', email: 'ada@example.com', password: 'password123' });
    const form = fixture.debugElement.query(By.css('form'));
    form.triggerEventHandler('ngSubmit', null);
    fixture.detectChanges();

    expect(fakeAuthService.register).toHaveBeenCalledWith('ada@example.com', 'password123', 'Ada Lovelace');
    expect(router.navigateByUrl).not.toHaveBeenCalled();

    fakeAuthService.setState({ status: 'success' });
    TestBed.tick();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/feed');
  });

  it('shows a toast with the error message when register fails', () => {
    component.form.setValue({ displayName: 'Ada Lovelace', email: 'ada@example.com', password: 'password123' });
    const form = fixture.debugElement.query(By.css('form'));
    form.triggerEventHandler('ngSubmit', null);

    fakeAuthService.setState({ status: 'error', error: { kind: 'server', message: 'Email already in use.', statusCode: 409 } });
    TestBed.tick();
    fixture.detectChanges();

    expect(component.toastOpen()).toBeTrue();
    expect(component.toastMessage()).toBe('Email already in use.');
  });
});
