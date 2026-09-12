import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { AppErrorKind } from '../../../core/models/app-error';
import { provideTestTranslations } from '../../../testing/translate-testing';
import { ErrorViewComponent } from './error-view.component';

const EXPECTED_MESSAGES: Record<AppErrorKind, string> = {
  network: "You're offline. Check your connection and try again.",
  unauthorized: 'Your session has expired. Please sign in again.',
  server: 'Something went wrong on our end. Please try again shortly.',
  cache: "We couldn't load the saved data on this device.",
  validation: 'The server sent back something unexpected. Please try again.',
};

describe('ErrorViewComponent', () => {
  let fixture: ComponentFixture<ErrorViewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ErrorViewComponent],
      providers: [provideIonicAngular(), provideTestTranslations()],
    }).compileComponents();

    fixture = TestBed.createComponent(ErrorViewComponent);
  });

  (Object.keys(EXPECTED_MESSAGES) as AppErrorKind[]).forEach((kind) => {
    it(`renders the message for an AppError of kind "${kind}"`, () => {
      fixture.componentInstance.error = { kind, message: 'raw backend message' };
      fixture.detectChanges();

      const message = fixture.debugElement.query(By.css('.error-view__message'))
        .nativeElement as HTMLElement;
      expect(message.textContent?.trim()).toBe(EXPECTED_MESSAGES[kind]);
    });
  });

  it('emits retry when the retry button is clicked', () => {
    fixture.componentInstance.error = { kind: 'network', message: 'raw backend message' };
    fixture.detectChanges();

    const retrySpy = jasmine.createSpy('retry');
    fixture.componentInstance.retry.subscribe(retrySpy);

    fixture.debugElement.query(By.css('ion-button')).triggerEventHandler('click', null);

    expect(retrySpy).toHaveBeenCalled();
  });
});
