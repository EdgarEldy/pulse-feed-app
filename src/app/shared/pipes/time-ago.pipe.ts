import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'timeAgo',
  pure: false,
  standalone: true,
})
export class TimeAgoPipe implements PipeTransform {
  transform(value: string): string {
    if (!value) {
      return '';
    }
    const diffMs = Date.now() - new Date(value).getTime();
    const diffSec = Math.floor(diffMs / 1000);

    if (diffSec < 60) {
      return 'just now';
    }
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) {
      return `${diffMin}m ago`;
    }
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) {
      return `${diffHours}h ago`;
    }
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) {
      return `${diffDays}d ago`;
    }
    const diffWeeks = Math.floor(diffDays / 7);
    if (diffWeeks < 5) {
      return `${diffWeeks}w ago`;
    }
    const diffMonths = Math.floor(diffDays / 30);
    if (diffMonths < 12) {
      return `${diffMonths}mo ago`;
    }
    const diffYears = Math.floor(diffDays / 365);
    return `${diffYears}yr ago`;
  }
}
