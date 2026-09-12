import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { provideTestTranslations } from '../../../testing/translate-testing';
import { LoadingIndicatorComponent } from './loading-indicator.component';

describe('LoadingIndicatorComponent', () => {
  let fixture: ComponentFixture<LoadingIndicatorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoadingIndicatorComponent],
      providers: [provideIonicAngular(), provideTestTranslations()],
    }).compileComponents();

    fixture = TestBed.createComponent(LoadingIndicatorComponent);
  });

  it('renders with the given label as its accessible name', () => {
    fixture.componentInstance.label = 'Loading posts';
    fixture.detectChanges();

    const status = fixture.debugElement.query(By.css('[role="status"]'));
    expect(status.attributes['aria-label']).toBe('Loading posts');
  });

  it('falls back to a default accessible name when no label is provided', () => {
    fixture.detectChanges();

    const status = fixture.debugElement.query(By.css('[role="status"]'));
    expect(status.attributes['aria-label']).toBe('Loading');
  });
});
