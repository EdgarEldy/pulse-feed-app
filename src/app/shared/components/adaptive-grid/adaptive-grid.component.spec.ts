import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { AdaptiveGridComponent } from './adaptive-grid.component';

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];

  constructor(readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.instances.push(this);
  }

  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

function emitWidth(width: number): void {
  const instance = FakeResizeObserver.instances[FakeResizeObserver.instances.length - 1];
  instance.callback(
    [{ contentRect: { width } } as ResizeObserverEntry],
    instance as unknown as ResizeObserver,
  );
}

describe('AdaptiveGridComponent', () => {
  let originalResizeObserver: typeof ResizeObserver;
  let fixture: ComponentFixture<AdaptiveGridComponent>;

  beforeEach(async () => {
    FakeResizeObserver.instances = [];
    originalResizeObserver = window.ResizeObserver;
    (window as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
      FakeResizeObserver as unknown as typeof ResizeObserver;

    await TestBed.configureTestingModule({
      imports: [AdaptiveGridComponent],
      providers: [provideIonicAngular()],
    }).compileComponents();

    fixture = TestBed.createComponent(AdaptiveGridComponent);
  });

  afterEach(() => {
    window.ResizeObserver = originalResizeObserver;
  });

  it('renders one column when the measured width is under the tablet breakpoint', () => {
    fixture.detectChanges();

    emitWidth(500);
    fixture.detectChanges();

    expect(fixture.componentInstance.activeColumns()).toBe(1);
    const row = fixture.debugElement.query(By.css('.adaptive-grid__row')).nativeElement as HTMLElement;
    expect(row.style.getPropertyValue('--adaptive-grid-columns')).toBe('1');
  });

  it('renders multiple columns once the measured width crosses the tablet breakpoint', () => {
    fixture.detectChanges();

    emitWidth(800);
    fixture.detectChanges();

    expect(fixture.componentInstance.activeColumns()).toBe(2);
    const row = fixture.debugElement.query(By.css('.adaptive-grid__row')).nativeElement as HTMLElement;
    expect(row.style.getPropertyValue('--adaptive-grid-columns')).toBe('2');
  });

  it('renders three columns once the measured width crosses the desktop breakpoint', () => {
    fixture.detectChanges();

    emitWidth(1200);
    fixture.detectChanges();

    expect(fixture.componentInstance.activeColumns()).toBe(3);
  });

  it('uses the pinned columns input instead of the measured width when provided', () => {
    fixture.componentRef.setInput('columns', 3);
    fixture.detectChanges();

    emitWidth(300);
    fixture.detectChanges();

    expect(fixture.componentInstance.activeColumns()).toBe(3);
  });
});
