import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

/**
 * Converts an ISO 8601 timestamp into a human-readable relative string
 * ("just now", "3m ago", "2h ago", "4d ago", "1w ago", "2mo ago", "1yr ago").
 *
 * `pure: false` is required because the input string never changes — the pipe
 * needs Angular to re-call `transform()` on each change-detection cycle so
 * the displayed label stays current as real time advances. To avoid redundant
 * recomputation, the result is cached internally and returned unchanged as
 * long as the displayed label would not yet differ (coarse time buckets).
 * The cache key includes the active language, so a language switch still
 * recomputes the label instead of serving a stale-language string.
 */
@Pipe({
  name: 'timeAgo',
  pure: false,
  standalone: true,
})
export class TimeAgoPipe implements PipeTransform {
  private readonly translate = inject(TranslateService);

  private lastInput = '';
  private lastBucket = -1;
  private lastLang = '';
  private lastResult = '';

  transform(value: string): string {
    if (!value) return '';
    const diffMs = Date.now() - new Date(value).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const bucket = this.bucket(diffSec);
    const lang = this.translate.currentLang() ?? '';
    if (value === this.lastInput && bucket === this.lastBucket && lang === this.lastLang) {
      return this.lastResult;
    }
    this.lastInput = value;
    this.lastBucket = bucket;
    this.lastLang = lang;
    this.lastResult = this.compute(diffSec);
    return this.lastResult;
  }

  private bucket(diffSec: number): number {
    if (diffSec < 60) return 0;
    if (diffSec < 3600) return Math.floor(diffSec / 60);
    if (diffSec < 86400) return 3600 + Math.floor(diffSec / 3600);
    if (diffSec < 604800) return 86400 + Math.floor(diffSec / 86400);
    if (diffSec < 2592000) return 604800 + Math.floor(diffSec / 604800);
    if (diffSec < 31536000) return 2592000 + Math.floor(diffSec / 2592000);
    return 31536000 + Math.floor(diffSec / 31536000);
  }

  private compute(diffSec: number): string {
    if (diffSec < 60) return this.translate.instant('timeAgo.justNow');
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return this.translate.instant('timeAgo.minutes', { count: diffMin });
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return this.translate.instant('timeAgo.hours', { count: diffHours });
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return this.translate.instant('timeAgo.days', { count: diffDays });
    const diffWeeks = Math.floor(diffDays / 7);
    if (diffWeeks < 5) return this.translate.instant('timeAgo.weeks', { count: diffWeeks });
    const diffMonths = Math.floor(diffDays / 30);
    if (diffMonths < 12) return this.translate.instant('timeAgo.months', { count: diffMonths });
    const diffYears = Math.floor(diffDays / 365);
    return this.translate.instant('timeAgo.years', { count: diffYears });
  }
}
