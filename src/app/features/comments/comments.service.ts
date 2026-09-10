import { Injectable, Signal, inject, signal } from '@angular/core';
import { map, throwError } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { AppError } from '../../core/models/app-error';
import { loadOfflineFirst } from '../../core/offline/offline-first.util';
import { SyncService } from '../../core/offline/sync.service';
import { CommentsApiService, CreateCommentPayload } from './comments-api.service';
import { CommentsLocalService } from './comments-local.service';
import { Comment, CommentRow } from './comment.model';

/**
 * Same `idle`/`loading`/`error`/`success` discriminated union `PostsState`
 * establishes, `nextCursor` included directly since a paginated comment
 * thread is exactly what `CommentsSectionComponent` needs from this state.
 *
 * `postId` rides along in the `success` case: unlike the feed (one global
 * list), this state only ever holds one post's comments at a time, and
 * `addComment`/`loadMore` need to know which post the currently loaded
 * page belongs to before appending to it.
 *
 * `data` is typed `CommentRow[]`, not `Comment[]`: `CommentTileComponent`
 * needs `pendingSync` to decide whether to show a pending indicator and
 * hide the delete action, and every place below that writes into this
 * signal already stamps `pendingSync` onto whatever it got back.
 */
export type CommentsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | { status: 'success'; postId: string; data: CommentRow[]; nextCursor: string | null };

/**
 * `loadOfflineFirst`'s `remote`/`cacheRead` branches return differently
 * shaped data even though they are typed together as `Comment`: a cache
 * read goes through `CommentsLocalService.getAll()`, which genuinely
 * returns `CommentRow[]` (structurally assignable to `Comment[]`, so
 * TypeScript does not complain, but `pendingSync` really is there at
 * runtime), while a remote read has no `pendingSync` at all. This
 * normalizes either shape into a real `CommentRow`, defaulting
 * `pendingSync` to `false` only when it is genuinely absent (a
 * remote-sourced comment), never overwriting a `true` a cache-sourced row
 * actually has.
 */
function toCommentRow(comment: Comment | CommentRow): CommentRow {
  return { ...comment, pendingSync: 'pendingSync' in comment ? comment.pendingSync : false };
}

/**
 * Facade for `features/comments`. `CommentsSectionComponent`,
 * `CommentInputComponent`, and `CommentTileComponent` are the only things
 * that should depend on this service; none of them injects
 * `CommentsApiService` or `CommentsLocalService` directly.
 *
 * Depends on `AuthService` for `currentUser()` only to fill in
 * `authorId`/`authorName`/`authorPhotoUrl` on an optimistic comment created
 * while offline, the same reason `PostsService` depends on it for
 * `createPost`.
 */
@Injectable({ providedIn: 'root' })
export class CommentsService {
  private readonly api = inject(CommentsApiService);
  private readonly local = inject(CommentsLocalService);
  private readonly auth = inject(AuthService);
  private readonly sync = inject(SyncService);

  private readonly state = signal<CommentsState>({ status: 'idle' });
  readonly comments: Signal<CommentsState> = this.state.asReadonly();

  constructor() {
    this.sync.register<Comment | null>({
      entityType: 'comment',
      replay: (operation, payload) => {
        switch (operation) {
          case 'create':
            return this.api.addComment(payload as CreateCommentPayload);
          case 'delete': {
            const { id } = payload as { id: string };
            return this.api.deleteComment(id).pipe(map(() => null));
          }
          case 'update':
            // Comments have no update operation per the API Contract:
            // addComment/deleteComment never enqueue one. Handled
            // explicitly, rather than omitted, so this switch stays
            // exhaustive over PendingWriteOperation.
            return throwError(() => new Error('Comments do not support an update operation.'));
        }
      },
      onSynced: async (tempId, synced) => {
        // `synced` is only ever non-null here for the `create` case: a
        // queued `delete` never passes a `tempId` to `enqueue`, so
        // `SyncService.replayAll` never calls `onSynced` for those rows at
        // all (see its `row.temp_id !== null` guard).
        if (!synced) {
          return;
        }
        const row: CommentRow = { ...synced, pendingSync: false };
        await this.local.replaceId(tempId, row);
        this.state.update((s) =>
          s.status === 'success' ? { ...s, data: s.data.map((comment) => (comment.id === tempId ? row : comment)) } : s,
        );
      },
    });
  }

  /**
   * A single post's own comments lifecycle, tried against the network
   * first, falling back to whatever `comments_cache` already has for this
   * `postId` while offline. `CommentsLocalService` only exposes `getAll()`
   * (no dedicated `getByPostId`, per `SqliteTable<T>`'s lack of `WHERE`
   * filtering), so the cache fallback reads the full cached set and
   * filters it down here.
   */
  loadComments(postId: string): void {
    this.state.set({ status: 'loading' });
    loadOfflineFirst({
      remote: () => this.api.getComments(postId),
      cacheRead: async () => {
        const rows = await this.local.getAll();
        return { items: rows.filter((row) => row.postId === postId), nextCursor: null };
      },
      // A row freshly read from the server is never itself pending: it is
      // tagged pendingSync: false explicitly rather than left undefined.
      cacheWrite: (page) => this.local.upsertAll(page.items.map((comment) => ({ ...comment, pendingSync: false }))),
    }).subscribe((result) => {
      this.state.set(
        result.status === 'error'
          ? result
          : { status: 'success', postId, data: result.data.items.map(toCommentRow), nextCursor: result.data.nextCursor },
      );
    });
  }

  loadMore(postId: string): void {
    const current = this.state();
    if (current.status !== 'success' || current.postId !== postId || current.nextCursor === null) {
      return;
    }
    this.api.getComments(postId, current.nextCursor).subscribe({
      next: (page) => {
        // Reads `this.state()` fresh here rather than closing over
        // `current` captured above, the same reasoning `PostsService.loadMore`
        // applies: `comments` can change while this request is in flight.
        this.state.update((s) =>
          s.status === 'success' && s.postId === postId
            ? { status: 'success', postId, data: [...s.data, ...page.items.map(toCommentRow)], nextCursor: page.nextCursor }
            : s,
        );
        void this.local.upsertAll(page.items.map((comment) => ({ ...comment, pendingSync: false })));
      },
      error: (error: AppError) => this.state.set({ status: 'error', error }),
    });
  }

  /**
   * Rejects empty content before ever reaching `CommentsApiService`, the
   * same "fail fast, locally" rule `PostsService.createPost` applies.
   */
  addComment(postId: string, content: string): void {
    if (!content.trim()) {
      // CommentInputComponent already guards before calling here; this is a
      // defensive check only. Returning silently avoids clobbering a
      // successfully loaded comment list with a transient validation error.
      return;
    }
    const payload: CreateCommentPayload = { postId, content };
    this.api.addComment(payload).subscribe({
      next: (comment) => {
        const row: CommentRow = { ...comment, pendingSync: false };
        void this.local.upsert(row);
        this.prependComment(postId, row);
      },
      error: (error: AppError) => {
        if (error.kind !== 'network') {
          this.state.set({ status: 'error', error });
          return;
        }
        const tempId = `temp-${crypto.randomUUID()}`;
        const author = this.auth.currentUser();
        const optimisticComment: CommentRow = {
          id: tempId,
          postId,
          authorId: author?.id ?? '',
          authorName: author?.displayName ?? '',
          authorPhotoUrl: author?.photoUrl ?? '',
          content,
          createdAt: new Date().toISOString(),
          pendingSync: true,
        };
        void this.local.upsert(optimisticComment);
        this.prependComment(postId, optimisticComment);
        void this.sync.enqueue('comment', 'create', payload, tempId);
      },
    });
  }

  /**
   * Prepends a freshly created comment to `comments`, initializing it to a
   * one-item `success` state (for this `postId`) when it is not already a
   * matching `success` state, rather than silently dropping the write.
   * `CommentInputComponent` is reachable without `loadComments(postId)`
   * having run first (a modal opened before the section below it has
   * finished its first load), in which case `comments()` is still `idle`;
   * without this, the new comment would never appear in the signal the UI
   * watches to know the create succeeded. Mirrors `PostsService`'s
   * `prependToFeed`: comments are newest-first, the same convention
   * `GET /posts` already uses for the feed, so a newly posted comment
   * belongs at the top and `loadMore`'s cursor pages toward older comments
   * appended at the end.
   */
  private prependComment(postId: string, comment: CommentRow): void {
    this.state.update((s) =>
      s.status === 'success' && s.postId === postId
        ? { ...s, data: [comment, ...s.data] }
        : { status: 'success', postId, data: [comment], nextCursor: null },
    );
  }

  /**
   * A pending delete stays visible in `comments`' `data`, tagged
   * `pendingSync: true`, rather than disappearing immediately, the same
   * reasoning `PostsService.deletePost` applies.
   */
  deleteComment(id: string): void {
    const current = this.state();
    if (current.status === 'success' && current.data.find((c) => c.id === id)?.pendingSync) {
      // The business rule (enforced by canDelete in CommentsSectionComponent)
      // is also checked here so the service itself is self-consistent: a
      // comment with a temp- id does not exist server-side, so sending
      // DELETE /comments/temp-xxx would get a non-network error and wipe
      // the loaded comment list from state.
      return;
    }
    this.api.deleteComment(id).subscribe({
      next: () => {
        void this.local.delete(id);
        this.state.update((s) => (s.status === 'success' ? { ...s, data: s.data.filter((comment) => comment.id !== id) } : s));
      },
      error: (error: AppError) => {
        if (error.kind !== 'network') {
          this.state.set({ status: 'error', error });
          return;
        }
        this.applyOptimistic(id, (comment) => ({ ...comment, pendingSync: true }));
        void this.sync.enqueue('comment', 'delete', { id });
      },
    });
  }

  private applyOptimistic(id: string, update: (comment: CommentRow) => CommentRow): void {
    // Capture the updated row inside state.update() rather than reading
    // the full table again afterwards: the row is already in-memory, so a
    // second getAll() is a needless full-table scan across all cached posts.
    let updatedRow: CommentRow | undefined;
    this.state.update((s) => {
      if (s.status !== 'success') return s;
      const data = s.data.map((comment) => {
        if (comment.id !== id) return comment;
        updatedRow = update(comment);
        return updatedRow;
      });
      return { ...s, data };
    });
    if (updatedRow) {
      void this.local.upsert(updatedRow);
    }
  }
}
