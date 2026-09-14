import { Injectable, Signal, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { AppError } from '../../core/models/app-error';
import { SyncService } from '../../core/offline/sync.service';
import { LikesApiService } from './likes-api.service';

/**
 * Per-post like state held in `LikesService`. Keyed by `postId` in the
 * facade's Map signal so every post card visible in the feed has its own
 * isolated `isLiked`/`likesCount` pair without requiring separate signals
 * per post or a global "selected post" concept.
 */
export interface LikeState {
  isLiked: boolean;
  likesCount: number;
}

/**
 * Facade for `features/likes`. `LikeButtonComponent` is the only thing that
 * should depend on this service; it never injects `LikesApiService` directly.
 *
 * State design: a single `Map<string, LikeState>` signal keyed by `postId`
 * so the feed can display many posts simultaneously, each with its own
 * independently toggled like button, without per-post signals proliferating
 * in the DI tree.
 *
 * Optimistic UI: `toggle()` flips `isLiked` and adjusts `likesCount` in the
 * signal *before* the HTTP call returns. The heart icon changes instantly on
 * tap — the whole point of the feature — and the server response either
 * confirms the guess or corrects it. On a network failure, the optimistic
 * state is kept and the intent is durably queued via `SyncService` so the
 * like is not silently lost.
 *
 * No `SyncService.register()` call: likes have no server-generated id, so
 * there is nothing for an `onSynced` reconciler to do. `SyncService.replayAll()`
 * already handles the missing-reconciler case gracefully — it drops the row
 * from the queue and moves on — so no stub reconciler is needed here either.
 */
@Injectable({ providedIn: 'root' })
export class LikesService {
  private readonly api = inject(LikesApiService);
  private readonly sync = inject(SyncService);

  private readonly likeStates = signal(new Map<string, LikeState>());
  // Tracks posts with an in-flight toggle so a second tap is ignored while
  // the first request is still pending, preventing stale-snapshot reverts.
  private readonly inFlight = new Set<string>();

  /** Read-only view of per-post like state, keyed by `postId`. */
  readonly states: Signal<Map<string, LikeState>> = this.likeStates.asReadonly();

  /**
   * Seeds the signal with initial like state for `postId`. Safe to call
   * multiple times: if state for this post already exists it is left
   * unchanged (guards against a re-render resetting an in-flight optimistic
   * update).
   *
   * Called by `PostTileComponent` and `PostDetailPage` when they receive
   * their post input, before the user can tap the like button.
   */
  initPost(postId: string, likesCount: number, isLiked: boolean): void {
    this.likeStates.update((map) => {
      if (map.has(postId)) {
        return map;
      }
      const next = new Map(map);
      next.set(postId, { isLiked, likesCount });
      return next;
    });
  }

  /**
   * Optimistically toggles the like for `postId`, then reconciles with the
   * server response.
   *
   * The optimistic pattern in three steps:
   *  1. Flip the signal immediately so the heart icon responds before the
   *     round-trip completes.
   *  2. Call the API. On success, replace the optimistic values with the
   *     server's authoritative `liked`/`likesCount`.
   *  3. On failure: if the device is offline (`error.kind === 'network'`),
   *     keep the optimistic state and durably queue the intent via
   *     `SyncService` so it replays once connectivity is restored. For any
   *     other error (e.g. the post was deleted), revert the flip so the UI
   *     reflects the true server state.
   */
  toggle(postId: string): void {
    const before = this.likeStates().get(postId);
    // Ignore a second tap while the first request is still in-flight: without
    // this guard, the error-revert path would restore the first call's
    // optimistic snapshot rather than the true original state.
    if (!before || this.inFlight.has(postId)) {
      return;
    }
    this.inFlight.add(postId);

    // Step 1 — optimistic flip. Math.max(0, ...) prevents a backend count
    // inconsistency from producing a negative displayed count.
    const optimistic: LikeState = {
      isLiked: !before.isLiked,
      likesCount: before.isLiked ? Math.max(0, before.likesCount - 1) : before.likesCount + 1,
    };
    this.applyState(postId, optimistic);

    // Step 2 & 3 — issue the request and reconcile.
    this.api.toggle(postId).pipe(
      finalize(() => this.inFlight.delete(postId)),
    ).subscribe({
      next: ({ liked, likesCount }) => {
        // Server's answer is authoritative: replace the optimistic guess.
        this.applyState(postId, { isLiked: liked, likesCount });
      },
      error: (error: AppError) => {
        if (error.kind === 'network') {
          // Offline: the user sees the toggled state, the write is queued.
          // No tempId argument — the like composite key (userId, postId) is
          // already known, no server-generated id will be produced.
          void this.sync.enqueue('like', 'update', { postId });
        } else {
          // Non-network error (server rejected the toggle): revert.
          this.applyState(postId, before);
        }
      },
    });
  }

  /**
   * Fetches fresh like status for `postId` from the API and updates `isLiked`
   * in the signal. `likesCount` is not updated here because the
   * `GET /posts/:postId/likes/me` endpoint only returns `{ liked: boolean }`.
   *
   * A failure here is silently swallowed: `getStatus` is a best-effort
   * refresh, and failing it should not corrupt the displayed count that was
   * already seeded by `initPost`.
   */
  getStatus(postId: string): void {
    this.api.getStatus(postId).subscribe({
      next: ({ liked }) => {
        const current = this.likeStates().get(postId);
        if (!current) {
          return;
        }
        this.applyState(postId, { ...current, isLiked: liked });
      },
      error: () => {
        // Intentionally no-op: status fetch failure leaves displayed state
        // unchanged.
      },
    });
  }

  private applyState(postId: string, state: LikeState): void {
    this.likeStates.update((map) => {
      const next = new Map(map);
      next.set(postId, state);
      return next;
    });
  }
}
