import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { apiEndpoints } from '../../core/http/api-endpoints';
import { BaseApiService } from '../../core/http/base-api.service';
import { LikeStatus, LikeToggleResult, likeStatusSchema, likeToggleResultSchema } from './like.dto';

/**
 * The response shape shared by both like endpoints. Structurally identical to
 * `LikeToggleResult` in `like.dto.ts`; re-exported here under a name that
 * makes sense at the `LikesApiService` boundary so callers do not need to
 * reach into `like.dto` directly.
 */
export type { LikeToggleResult as LikeResponse };

/**
 * Talks to `/posts/:postId/likes` and `/posts/:postId/likes/me` over
 * `BaseApiService`. One method per endpoint, no direct `HttpClient` use, no
 * hand-written error handling. `LikesService` (the facade) is the only thing
 * that injects this service.
 */
@Injectable({ providedIn: 'root' })
export class LikesApiService {
  private readonly api = inject(BaseApiService);

  /**
   * Toggles the current user's like on `postId`. The endpoint is idempotent
   * via a toggle semantics: a second call undoes the first, so queued
   * offline writes can be replayed safely without deduplication on the
   * client.
   *
   * Returns the authoritative `liked` state and `likesCount` after the
   * toggle, which `LikesService` uses to reconcile its optimistic update.
   */
  toggle(postId: string): Observable<LikeToggleResult> {
    return this.api.post(apiEndpoints.likes.forPost(postId), null, likeToggleResultSchema);
  }

  /**
   * Fetches whether the current user has liked `postId`. Useful on a post
   * detail page opened without a prior feed response that already carried
   * `isLikedByMe`.
   *
   * Per the API Contract, this endpoint returns only `{ liked: boolean }` —
   * no `likesCount` — so only `isLiked` is updated in `LikesService` state
   * after a call to this method.
   */
  getStatus(postId: string): Observable<LikeStatus> {
    return this.api.get(apiEndpoints.likes.meForPost(postId), undefined, likeStatusSchema);
  }
}
