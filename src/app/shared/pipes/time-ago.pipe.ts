import { Pipe, PipeTransform } from '@angular/core';

/**
 * Converts an ISO 8601 timestamp into a human-readable relative string
 * ("just now", "3m ago", "2h ago", "4d ago", "1w ago", "2mo ago", "1yr ago").
 *
 * `pure: false` is required because the input string never changes — the pipe
 * needs Angular to re-call `transform()` on each change-detection cycle so
 * the displayed label stays current as real time advances. To avoid redundant
 * recomputation, the result is cached internally and returned unchanged as
 * long as the displayed label would not yet differ (coarse time buckets).
 */
@Pipe({
  name: 'timeAgo',
  pure: false,
  standalone: true,
})
export class TimeAgoPipe implements PipeTransform {
  private lastInput = '';
  private lastBucket = -1;
  private lastResult = '';

  transform(value: string): string {
    if (!value) return '';
    const diffMs = Date.now() - new Date(value).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const bucket = this.bucket(diffSec);
    if (value === this.lastInput && bucket === this.lastBucket) {
      return this.lastResult;
    }
    this.lastInput = value;
    this.lastBucket = bucket;
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
    if (diffSec < 60) return 'just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    const diffWeeks = Math.floor(diffDays / 7);
    if (diffWeeks < 5) return `${diffWeeks}w ago`;
    const diffMonths = Math.floor(diffDays / 30);
    if (diffMonths < 12) return `${diffMonths}mo ago`;
    const diffYears = Math.floor(diffDays / 365);
    return `${diffYears}yr ago`;
  }
}
