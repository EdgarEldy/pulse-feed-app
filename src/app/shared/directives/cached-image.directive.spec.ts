import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FilesystemWeb } from '@capacitor/filesystem/dist/esm/web';
import { CachedImageDirective, CachedImageStatus } from './cached-image.directive';

@Component({
  standalone: true,
  imports: [CachedImageDirective],
  template: `<img [appCachedImage]="url" alt="test image" />`,
})
class HostComponent {
  url = 'https://example.com/post-image.jpg';
}

/**
 * `readFromCache`/`fetchAndCache` both chain the Capacitor plugin proxy's
 * own lazy web-implementation loading (a dynamic `import()`) on top of
 * `fetch`/`FileReader`, several async hops deep. Rather than guess exactly
 * how many microtask/macrotask turns that takes, this polls until the
 * directive settles out of `loading`, the same tolerant approach a real
 * app would need anyway since none of those hops are synchronous.
 */
async function waitForSettled(fixture: ComponentFixture<HostComponent>, directive: CachedImageDirective): Promise<void> {
  for (let attempt = 0; attempt < 30 && directive.status() === 'loading'; attempt++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
  }
}

function directiveInstance(fixture: ComponentFixture<HostComponent>): CachedImageDirective {
  return fixture.debugElement.query(By.directive(CachedImageDirective)).injector.get(CachedImageDirective);
}

describe('CachedImageDirective', () => {
  let fixture: ComponentFixture<HostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
  });

  it('shows a loading placeholder immediately, before the cache/network lookup settles', () => {
    fixture.detectChanges();

    const img = fixture.debugElement.query(By.css('img')).nativeElement as HTMLImageElement;
    expect(img.classList.contains('cached-image--loading')).toBeTrue();
    expect(img.src.startsWith('data:image/svg+xml')).toBeTrue();
  });

  it('downloads and caches the image on a cache miss, then renders it as loaded', async () => {
    spyOn(FilesystemWeb.prototype, 'stat').and.rejectWith(new Error('not cached yet'));
    const writeFileSpy = spyOn(FilesystemWeb.prototype, 'writeFile').and.resolveTo(undefined as never);
    spyOn(window, 'fetch').and.resolveTo({
      ok: true,
      headers: { get: () => 'image/png' },
      blob: () => Promise.resolve(new Blob(['bytes'], { type: 'image/png' })),
    } as unknown as Response);

    fixture.detectChanges();
    const directive = directiveInstance(fixture);
    await waitForSettled(fixture, directive);

    expect(directive.status()).toBe('loaded');
    expect(writeFileSpy).toHaveBeenCalledTimes(2);
    const img = fixture.debugElement.query(By.css('img')).nativeElement as HTMLImageElement;
    expect(img.classList.contains('cached-image--loading')).toBeFalse();
    expect(img.classList.contains('cached-image--error')).toBeFalse();
    expect(img.src.startsWith('data:image/png;base64,')).toBeTrue();
  });

  it('renders straight from disk on a cache hit, without calling fetch', async () => {
    spyOn(FilesystemWeb.prototype, 'stat').and.resolveTo(undefined as never);
    spyOn(FilesystemWeb.prototype, 'readFile').and.callFake((options: { path: string }) =>
      options.path.endsWith('.meta')
        ? Promise.resolve({ data: JSON.stringify({ mimeType: 'image/webp' }) })
        : Promise.resolve({ data: 'cached-base64-bytes' }),
    );
    const fetchSpy = spyOn(window, 'fetch');

    fixture.detectChanges();
    const directive = directiveInstance(fixture);
    await waitForSettled(fixture, directive);

    expect(directive.status()).toBe('loaded');
    expect(fetchSpy).not.toHaveBeenCalled();
    const img = fixture.debugElement.query(By.css('img')).nativeElement as HTMLImageElement;
    expect(img.src).toBe('data:image/webp;base64,cached-base64-bytes');
  });

  it('falls back to an error state when nothing is cached and the download fails', async () => {
    spyOn(FilesystemWeb.prototype, 'stat').and.rejectWith(new Error('not cached'));
    spyOn(window, 'fetch').and.rejectWith(new Error('network unreachable'));

    fixture.detectChanges();
    const directive = directiveInstance(fixture);
    await waitForSettled(fixture, directive);

    expect(directive.status()).toBe('error' satisfies CachedImageStatus);
    const img = fixture.debugElement.query(By.css('img')).nativeElement as HTMLImageElement;
    expect(img.classList.contains('cached-image--error')).toBeTrue();
  });
});
