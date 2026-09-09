import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { IonGrid, IonRow } from '@ionic/angular/standalone';

/** Column count the grid can settle on, either measured or pinned via `[columns]`. */
export type AdaptiveGridColumns = 1 | 2 | 3;

/**
 * These mirror `$breakpoint-tablet` / `$breakpoint-desktop` in
 * `src/theme/variables.scss`. SCSS variables are compiled away at build
 * time and are not readable from TypeScript at runtime, so the pixel
 * values are duplicated here deliberately. Keep these two constants in
 * sync by hand if the breakpoints in `variables.scss` ever change.
 */
const TABLET_BREAKPOINT_PX = 768;
const DESKTOP_BREAKPOINT_PX = 1024;

/**
 * Responsive layout primitive built on `ion-grid`/`ion-row`. Content
 * passed via `ng-content` (for example a `@for` loop of `PostCardComponent`
 * in the feed) flows into a CSS grid whose column count adapts to the
 * component's own measured width.
 *
 * Why `ResizeObserver` and not `@HostListener('window:resize')`: a
 * `window:resize` listener only ever reports the browser *viewport*
 * changing size. This component is meant to be reused inside layouts that
 * are narrower than the viewport, for instance the post feed embedded in a
 * side column of a wider detail-page layout, so it needs to react to its
 * own *container* shrinking or growing, which can happen without the
 * window ever resizing (a side panel opening, a parent flex/grid item
 * being resized). `ResizeObserver` observes one specific element and fires
 * whenever that element's box changes, which is the correct, container
 * relative signal for a reusable layout primitive; `window:resize` would
 * make this component quietly wrong the moment it is placed anywhere but
 * a full-width page.
 */
@Component({
  selector: 'app-adaptive-grid',
  standalone: true,
  imports: [IonGrid, IonRow],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-grid>
      <ion-row class="adaptive-grid__row" [style.--adaptive-grid-columns]="activeColumns()">
        <ng-content />
      </ion-row>
    </ion-grid>
  `,
  styles: [
    `
      .adaptive-grid__row {
        display: grid;
        grid-template-columns: repeat(var(--adaptive-grid-columns, 1), minmax(0, 1fr));
        gap: var(--app-space-md, 16px);
      }
    `,
  ],
})
export class AdaptiveGridComponent implements AfterViewInit {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * Optional override. When set, the grid always uses this column count
   * regardless of measured width. Left `null` by default, meaning "derive
   * the column count from the host's width against the breakpoints above".
   *
   * Declared with the `input()` signal API rather than `@Input()` so that
   * `activeColumns` below, a `computed()`, correctly tracks it as a
   * dependency: `computed()` only re-evaluates on reads of other signals,
   * a plain `@Input()` field read inside it would silently go stale if a
   * consumer rebound `[columns]` after the grid had already rendered.
   */
  readonly columns = input<AdaptiveGridColumns | null>(null);

  private readonly measuredWidth = signal(0);

  /**
   * The column count actually in effect right now: the `columns` override
   * when provided, otherwise the width-derived responsive value. Public so
   * a test (or a consumer) can assert against the current layout directly
   * instead of having to infer it from rendered CSS.
   */
  readonly activeColumns = computed<AdaptiveGridColumns>(() => {
    const columnsOverride = this.columns();
    if (columnsOverride !== null) {
      return columnsOverride;
    }
    const width = this.measuredWidth();
    if (width >= DESKTOP_BREAKPOINT_PX) {
      return 3;
    }
    if (width >= TABLET_BREAKPOINT_PX) {
      return 2;
    }
    return 1;
  });

  ngAfterViewInit(): void {
    const element = this.host.nativeElement;
    this.measuredWidth.set(element.getBoundingClientRect().width);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      this.measuredWidth.set(entry.contentRect.width);
    });
    observer.observe(element);

    this.destroyRef.onDestroy(() => observer.disconnect());
  }
}
