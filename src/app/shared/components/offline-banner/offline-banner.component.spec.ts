import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { OfflineBannerComponent } from './offline-banner.component';

describe('OfflineBannerComponent', () => {
  let fixture: ComponentFixture<OfflineBannerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OfflineBannerComponent],
      providers: [provideIonicAngular()],
    }).compileComponents();

    fixture = TestBed.createComponent(OfflineBannerComponent);
  });

  it('renders nothing when isOffline is false', () => {
    fixture.componentInstance.isOffline = false;
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.offline-banner'))).toBeNull();
  });

  it('renders the banner when isOffline is true', () => {
    fixture.componentInstance.isOffline = true;
    fixture.detectChanges();

    const banner = fixture.debugElement.query(By.css('.offline-banner'));
    expect(banner).not.toBeNull();
    expect((banner.nativeElement as HTMLElement).textContent).toContain(
      "You're offline. Showing saved content.",
    );
  });
});
