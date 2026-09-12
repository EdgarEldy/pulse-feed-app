import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { provideTestTranslations } from '../../testing/translate-testing';
import { TimeAgoPipe } from './time-ago.pipe';

describe('TimeAgoPipe', () => {
  let pipe: TimeAgoPipe;
  let translate: TranslateService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideTestTranslations()] });
    pipe = TestBed.runInInjectionContext(() => new TimeAgoPipe());
    translate = TestBed.inject(TranslateService);
    jasmine.clock().install();
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });

  function isoSecondsAgo(seconds: number): string {
    return new Date(Date.now() - seconds * 1000).toISOString();
  }

  it('returns an empty string for an empty input', () => {
    expect(pipe.transform('')).toBe('');
  });

  it('renders "just now" for a timestamp under a minute old', () => {
    jasmine.clock().mockDate(new Date('2024-06-01T12:00:00.000Z'));

    expect(pipe.transform(isoSecondsAgo(30))).toBe('just now');
  });

  it('renders a minutes label for a timestamp under an hour old', () => {
    jasmine.clock().mockDate(new Date('2024-06-01T12:00:00.000Z'));

    expect(pipe.transform(isoSecondsAgo(5 * 60))).toBe('5m ago');
  });

  it('renders an hours label for a timestamp under a day old', () => {
    jasmine.clock().mockDate(new Date('2024-06-01T12:00:00.000Z'));

    expect(pipe.transform(isoSecondsAgo(3 * 3600))).toBe('3h ago');
  });

  it('renders a days label for a timestamp under a week old', () => {
    jasmine.clock().mockDate(new Date('2024-06-01T12:00:00.000Z'));

    expect(pipe.transform(isoSecondsAgo(2 * 86400))).toBe('2d ago');
  });

  it('renders a weeks label for a timestamp under five weeks old', () => {
    jasmine.clock().mockDate(new Date('2024-06-01T12:00:00.000Z'));

    expect(pipe.transform(isoSecondsAgo(2 * 604800))).toBe('2w ago');
  });

  it('renders a months label for a timestamp under a year old', () => {
    jasmine.clock().mockDate(new Date('2024-06-01T12:00:00.000Z'));

    expect(pipe.transform(isoSecondsAgo(6 * 2592000))).toBe('6mo ago');
  });

  it('renders a years label for a timestamp over a year old', () => {
    jasmine.clock().mockDate(new Date('2024-06-01T12:00:00.000Z'));

    expect(pipe.transform(isoSecondsAgo(2 * 31536000))).toBe('2yr ago');
  });

  it('returns the cached label on a second call within the same bucket instead of recomputing', () => {
    jasmine.clock().mockDate(new Date('2024-06-01T12:00:00.000Z'));
    const instantSpy = spyOn(translate, 'instant').and.callThrough();
    const value = isoSecondsAgo(5 * 60);

    const first = pipe.transform(value);
    jasmine.clock().tick(1000);
    const second = pipe.transform(value);

    expect(second).toBe(first);
    expect(instantSpy).toHaveBeenCalledTimes(1);
  });

  it('recomputes once the elapsed time crosses into a new bucket', () => {
    jasmine.clock().mockDate(new Date('2024-06-01T12:00:00.000Z'));
    const value = isoSecondsAgo(59);

    expect(pipe.transform(value)).toBe('just now');

    jasmine.clock().tick(2000);

    expect(pipe.transform(value)).toBe('1m ago');
  });

  it('recomputes after a language switch even though the bucket has not changed', (done) => {
    jasmine.clock().mockDate(new Date('2024-06-01T12:00:00.000Z'));
    const instantSpy = spyOn(translate, 'instant').and.callThrough();
    const value = isoSecondsAgo(5 * 60);

    pipe.transform(value);
    expect(instantSpy).toHaveBeenCalledTimes(1);

    translate.use('fr').subscribe(() => {
      pipe.transform(value);
      expect(instantSpy).toHaveBeenCalledTimes(2);
      done();
    });
  });
});
