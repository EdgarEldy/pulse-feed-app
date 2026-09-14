import { Directive, ElementRef, Renderer2, effect, inject, input, signal } from '@angular/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';

/**
 * The three visual states this directive drives via host CSS classes. A
 * consumer's stylesheet decides what "loading"/"error" actually look like
 * (a low-opacity background, a spinner, whatever fits that component); this
 * directive only ever tracks *which* state applies, never how it renders.
 */
export type CachedImageStatus = 'loading' | 'loaded' | 'error';

const CACHE_DIRECTORY = Directory.Cache;

/**
 * Used whenever the real content type of a cached image cannot be
 * determined (an older cache entry written before the sidecar `.meta` file
 * existed, say). JPEG is a reasonable default: browsers happily decode a
 * PNG/WebP payload mislabeled as JPEG in the vast majority of cases, since
 * `<img>` decoding sniffs the actual byte signature rather than trusting
 * the `data:` URI's declared MIME type outright.
 */
const DEFAULT_MIME_TYPE = 'image/jpeg';

/**
 * A tiny, self-contained placeholder graphic (a flat gray square) shown
 * while an image is being resolved from the cache or downloaded. Inlined
 * as a `data:` URI instead of a static asset under `src/assets/` so this
 * directive has no asset-pipeline dependency: it works the moment it is
 * imported, in every environment (including component tests).
 */
const PLACEHOLDER_IMAGE_SRC = svgDataUri('<rect width="100%" height="100%" fill="#d9d9df"/>');

/**
 * Shown when the remote fetch fails and nothing usable is in the cache
 * either: the same flat gray square, with a simple "broken image" cross
 * drawn over it, so the failure is visually distinct from "still loading"
 * without depending on the browser's own broken-image icon (which differs
 * across browsers and says nothing to assistive technology on its own).
 */
const ERROR_IMAGE_SRC = svgDataUri(
  '<rect width="100%" height="100%" fill="#d9d9df"/>' +
    '<path d="M9 9 L23 23 M23 9 L9 23" stroke="#8a8a94" stroke-width="2.5" stroke-linecap="round"/>',
);

function svgDataUri(inner: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${inner}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Deterministic, synchronous string hash (FNV-1a-ish, 32-bit, folded to
 * base36). Not cryptographic, doesn't need to be: this only has to turn a
 * remote image URL into a filesystem-safe filename that is stable across
 * app runs (so the same URL always resolves to the same cache entry) and
 * collision-unlikely enough for a per-device image cache.
 */
function hashUrl(url: string): string {
  let hash = 0;
  for (let index = 0; index < url.length; index++) {
    hash = (hash * 31 + url.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Renders a remote image through Capacitor's `@capacitor/filesystem` disk
 * cache: `Directory.Cache` on native (cleared by the OS under storage
 * pressure, exactly the semantics a re-downloadable image cache wants) or
 * its IndexedDB-backed web equivalent, per `@capacitor/filesystem`'s own
 * web implementation.
 *
 * Two files are written per cached image, both keyed off `hashUrl(url)`:
 * - the image bytes themselves, base64-encoded (`Filesystem.writeFile`
 *   with no `encoding` option, which per this package's types means "the
 *   data is base64 and should be written as binary")
 * - a tiny `.meta` JSON sidecar recording the response's `content-type`,
 *   read back on a cache hit so the `data:` URI this directive hands the
 *   `<img>` element declares the correct MIME type. The filename itself
 *   deliberately does not encode an extension: the hash is computed before
 *   anything is fetched, while the MIME type is only known afterward, so a
 *   sidecar is simpler than trying to rename the file post-fetch.
 *
 * Usage:
 * ```html
 * <img [appCachedImage]="post.imageUrl" [alt]="post.title" />
 * ```
 *
 * Applies `.cached-image--loading` / `.cached-image--error` host classes
 * for the in-flight and failure states (see `CachedImageStatus`), and
 * swaps the element's own `src` to an inline placeholder/broken-image
 * graphic in those same states, so the host `<img>` never shows a bare
 * browser "broken image" icon while this directive is still working.
 */
@Directive({
  selector: '[appCachedImage]',
  standalone: true,
  host: {
    '[class.cached-image--loading]': "status() === 'loading'",
    '[class.cached-image--error]': "status() === 'error'",
  },
})
export class CachedImageDirective {
  private readonly element = inject(ElementRef<HTMLImageElement>);
  private readonly renderer = inject(Renderer2);

  /** The remote image URL to resolve through the cache. */
  readonly src = input.required<string>({ alias: 'appCachedImage' });

  private readonly cacheStatus = signal<CachedImageStatus>('loading');
  readonly status = this.cacheStatus.asReadonly();

  constructor() {
    // `effect()`'s cleanup callback runs both right before the effect
    // re-runs (the input was rebound to a different URL, e.g. this same
    // directive instance being reused for a different post as the feed
    // scrolls) and on destroy. Aborting the in-flight fetch through that
    // callback, rather than only guarding with a request counter, means a
    // stale request actually stops consuming bandwidth instead of merely
    // having its result discarded once it eventually resolves.
    effect((onCleanup) => {
      const url = this.src();
      const controller = new AbortController();
      onCleanup(() => controller.abort());
      void this.loadImage(url, controller.signal);
    });
  }

  private async loadImage(url: string, signal: AbortSignal): Promise<void> {
    this.cacheStatus.set('loading');
    this.applySrc(PLACEHOLDER_IMAGE_SRC);

    try {
      const cached = await this.readFromCache(url);
      if (signal.aborted) {
        return;
      }
      const resolvedSrc = cached ?? (await this.fetchAndCache(url, signal));
      if (signal.aborted) {
        return;
      }
      this.applySrc(resolvedSrc);
      this.cacheStatus.set('loaded');
    } catch {
      if (signal.aborted) {
        // The URL changed (or this directive was destroyed) mid-fetch;
        // this rejection is expected noise from aborting `fetch()`
        // ourselves, not a real failure worth surfacing as an error state.
        return;
      }
      this.cacheStatus.set('error');
      this.applySrc(ERROR_IMAGE_SRC);
    }
  }

  /** Returns a ready-to-use `data:` URI when `url` is already cached on disk, `null` otherwise. */
  private async readFromCache(url: string): Promise<string | null> {
    const path = this.cacheFileName(url);
    try {
      await Filesystem.stat({ path, directory: CACHE_DIRECTORY });
    } catch {
      // `stat` rejects when the file does not exist yet. Every other
      // failure mode (permissions, a corrupt plugin state) is treated the
      // same way here: fall through to a fresh download rather than
      // surfacing a cache-read failure as this image's error state.
      return null;
    }

    const [file, mimeType] = await Promise.all([
      Filesystem.readFile({ path, directory: CACHE_DIRECTORY }),
      this.readCachedMimeType(url),
    ]);
    return this.toDataUrl(await this.toBase64(file.data), mimeType);
  }

  /** Downloads `url`, writes it (and its MIME type) into the cache, and returns a `data:` URI for it. */
  private async fetchAndCache(url: string, signal: AbortSignal): Promise<string> {
    const response = await fetch(url, { signal });
    if (!response.ok) {
      throw new Error(`Failed to download image (${response.status}): ${url}`);
    }
    const blob = await response.blob();
    const mimeType = response.headers.get('content-type') ?? blob.type ?? DEFAULT_MIME_TYPE;
    const base64 = await this.blobToBase64(blob);

    await Filesystem.writeFile({ path: this.cacheFileName(url), directory: CACHE_DIRECTORY, data: base64 });
    await Filesystem.writeFile({
      path: this.metaFileName(url),
      directory: CACHE_DIRECTORY,
      data: JSON.stringify({ mimeType }),
      encoding: Encoding.UTF8,
    });

    return this.toDataUrl(base64, mimeType);
  }

  private async readCachedMimeType(url: string): Promise<string> {
    try {
      const meta = await Filesystem.readFile({ path: this.metaFileName(url), directory: CACHE_DIRECTORY, encoding: Encoding.UTF8 });
      const parsed = JSON.parse(await this.toText(meta.data)) as { mimeType?: string };
      return parsed.mimeType ?? DEFAULT_MIME_TYPE;
    } catch {
      // No sidecar (or it is unreadable): fall back to the default rather
      // than failing the whole cache hit over a missing MIME type.
      return DEFAULT_MIME_TYPE;
    }
  }

  private cacheFileName(url: string): string {
    return `pf-image-cache-${hashUrl(url)}`;
  }

  private metaFileName(url: string): string {
    return `${this.cacheFileName(url)}.meta`;
  }

  /**
   * `ReadFileResult.data` is typed `string | Blob` because
   * `@capacitor/filesystem`'s web implementation can, in principle, hand
   * back a `Blob`. This directive only ever writes base64 strings itself
   * (see `fetchAndCache`), so in practice `data` is always already a
   * string; `toBase64`/`toText` below still handle the `Blob` branch so a
   * cache entry written some other way does not crash this directive.
   */
  private async toBase64(data: string | Blob): Promise<string> {
    return typeof data === 'string' ? data : this.blobToBase64(data);
  }

  private async toText(data: string | Blob): Promise<string> {
    return typeof data === 'string' ? data : data.text();
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        // `FileReader.readAsDataURL` prefixes the payload with
        // `data:<mime>;base64,`; `Filesystem.writeFile` wants only the
        // base64 payload itself when no `encoding` option is passed.
        resolve(result.slice(result.indexOf(',') + 1));
      };
      reader.onerror = () => reject(reader.error ?? new Error('Could not read the downloaded image.'));
      reader.readAsDataURL(blob);
    });
  }

  private toDataUrl(base64: string, mimeType: string): string {
    return `data:${mimeType};base64,${base64}`;
  }

  private applySrc(src: string): void {
    this.renderer.setProperty(this.element.nativeElement, 'src', src);
  }
}
