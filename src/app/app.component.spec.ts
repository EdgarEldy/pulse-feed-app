import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { AppComponent } from './app.component';
import { routes } from './app.routes';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideIonicAngular(), provideRouter(routes, withComponentInputBinding())],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('boots the app shell and renders the placeholder feed page for the default route', async () => {
    const fixture = TestBed.createComponent(AppComponent);

    const router = TestBed.inject(Router);
    await router.navigateByUrl('');

    fixture.detectChanges();

    const shell = fixture.nativeElement as HTMLElement;
    expect(shell.querySelector('ion-router-outlet')).toBeTruthy();
    expect(shell.textContent).toContain('Feed');
  });
});
