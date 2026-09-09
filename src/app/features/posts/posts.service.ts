import { Injectable, Signal, inject, signal } from '@angular/core';
import { map } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { AppError } from '../../core/models/app-error';
import { loadOfflineFirst } from '../../core/offline/offline-first.util';
import { SyncService } from '../../core/offline/sync.service';
import { CreatePostPayload, PostsApiService, UpdatePostPayload } from './posts-api.service';
import { PostsLocalService } from './posts-local.service';
import { Post, PostRow } from './post.model';

/**
 * Same `idle`/`loading`/`error`/`success` discriminated union README's Error
 * Handling section establishes, `nextCursor` included directly since the
 * feed's pagination is exactly what `FeedPage` needs from this state and
 * nothing it has to derive separately.
 */
export type PostsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | { status: 'success'; data: Post[]; nextCursor: string | null };

/**
 * A single post's own loading/error/data lifecycle, kept separate from
 * `PostsState` above: `PostDetailPage` loading one post should not disturb
 * whatever the feed already has loaded in `posts`, the same reasoning
 * `UsersService` applies by keeping `user` and `profileUpdate` apart.
 * `loadPost` updates this signal rather than returning an `Observable`
 * directly, so `PostDetailPage` can render loading/error/data states from a
 * signal exactly like `FeedPage` does, instead of one page in this feature
 * subscribing to a raw stream and the other reading a signal.
 */
export type PostDetailState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | { status: 'success'; data: Post };

/**
 * Facade for `features/posts`. `FeedPage`, `PostDetailPage`,
 * `CreatePostPage`, and `PostCardComponent` are the only things that should
 * depend on this service; none of them injects `PostsApiService` or
 * `PostsLocalService` directly.
 *
 * Depends on `AuthService` for `currentUser()` only to fill in
 * `authorId`/`authorName`/`authorPhotoUrl` on an optimistic post created
 * while offline (the server has not been reached yet, so nothing else knows
 * who the author is). One facade lightly depending on another when it
 * genuinely needs to is established precedent in this app already, not a
 * new pattern introduced here.
 */
@Injectable({ providedIn: 'root' })
export class PostsService {
  private readonly api = inject(PostsApiService);
  private readonly local = inject(PostsLocalService);
  private readonly auth = inject(AuthService);
  private readonly sync = inject(SyncService);

  private readonly state = signal<PostsState>({ status: 'idle' });
  readonly posts: Signal<PostsState> = this.state.asReadonly();

  private readonly detailState = signal<PostDetailState>({ status: 'idle' });
  readonly postDetail: Signal<PostDetailState> = this.detailState.asReadonly();

  /**
   * `null` while no create is in flight, `0`-`100` while one is. Reading
   * upload progress live is only possible through
   * `PostsApiService.createPostWithProgress`'s event stream, so `createPost`
   * below subscribes to that instead of the plain `createPost` on the API
   * layer, and forwards every intermediate event here. `CreatePostPage`
   * reads this signal to drive a progress bar without ever injecting
   * `PostsApiService` itself, keeping the "components only depend on the
   * facade" rule intact even though the thing being surfaced originates a
   * layer below where this facade's own state normally comes from.
   */
  private readonly uploadProgress = signal<number | null>(null);
  readonly createProgress: Signal<number | null> = this.uploadProgress.asReadonly();

  constructor() {
    this.sync.register<Post | null>({
      entityType: 'post',
      replay: (operation, payload) => {
        switch (operation) {
          case 'create':
            return this.api.createPost(payload as CreatePostPayload);
          case 'update': {
            const { id, ...changes } = payload as { id: string } & UpdatePostPayload;
            return this.api.updatePost(id, changes);
          }
          case 'delete': {
            const { id } = payload as { id: string };
            return this.api.deletePost(id).pipe(map(() => null));
          }
        }
      },
      onSynced: async (tempId, synced) => {
        // `synced` is only ever non-null here for the `create` case: a
        // queued `update`/`delete` never passes a `tempId` to `enqueue`, so
        // `SyncService.replayAll` never calls `onSynced` for those rows at
        // all (see its `row.temp_id !== null` guard). This null check is
        // just what keeps that assumption type-safe rather than load-bearing.
        if (!synced) {
          return;
        }
        const row: PostRow = { ...synced, pendingSync: false };
        await this.local.replaceId(tempId, row);
        this.state.update((s) =>
          s.status === 'success' ? { ...s, data: s.data.map((post) => (post.id === tempId ? row : post)) } : s,
        );
      },
    });
  }

  loadPosts(): void {
    this.state.set({ status: 'loading' });
    loadOfflineFirst({
      remote: () => this.api.getPosts(),
      cacheRead: async () => ({ items: await this.local.getAll(), nextCursor: null }),
      // A row freshly read from the server is never itself pending: it is
      // tagged pendingSync: false explicitly rather than left undefined, so
      // `PostRow`'s shape is honored the same way everywhere it is written.
      cacheWrite: (page) => this.local.upsertAll(page.items.map((post) => ({ ...post, pendingSync: false }))),
    }).subscribe((result) => {
      this.state.set(
        result.status === 'error' ? result : { status: 'success', data: result.data.items, nextCursor: result.data.nextCursor },
      );
    });
  }

  loadMore(): void {
    const current = this.state();
    if (current.status !== 'success' || current.nextCursor === null) {
      return;
    }
    this.api.getPosts(current.nextCursor).subscribe({
      next: (page) => {
        this.state.set({ status: 'success', data: [...current.data, ...page.items], nextCursor: page.nextCursor });
        void this.local.upsertAll(page.items.map((post) => ({ ...post, pendingSync: false })));
      },
      error: (error: AppError) => this.state.set({ status: 'error', error }),
    });
  }

  /**
   * A single-post equivalent of `loadPosts`: tries the network first, falls
   * back to whatever `posts_cache` already has for this `id` while offline.
   * There is no dedicated `getById` on `PostsLocalService` (it only exposes
   * `getAll`, per the reference `*LocalService` shape from
   * `feature/offline-and-sync`), so the cache fallback searches the full
   * cached set; the feed is small enough that this is not worth a bespoke
   * query.
   */
  loadPost(id: string): void {
    this.detailState.set({ status: 'loading' });
    loadOfflineFirst({
      remote: () => this.api.getPost(id),
      cacheRead: async () => {
        const rows = await this.local.getAll();
        const cached = rows.find((row) => row.id === id);
        if (!cached) {
          throw new Error('Post not cached locally.');
        }
        return cached;
      },
      cacheWrite: (post) => this.local.upsert({ ...post, pendingSync: false }),
    }).subscribe((result) => {
      this.detailState.set(result.status === 'error' ? result : { status: 'success', data: result.data });
    });
  }

  /**
   * Rejects an empty title/content before ever reaching `PostsApiService`,
   * the same "fail fast, locally" rule Reactive Forms validators apply
   * further up in `CreatePostPage`; this guard exists independently of that
   * form validation so `PostsService` itself never sends a request the API
   * Contract would reject anyway.
   */
  createPost(payload: CreatePostPayload): void {
    if (!payload.title.trim() || !payload.content.trim()) {
      this.state.set({ status: 'error', error: { kind: 'validation', message: 'Title and content are required.' } });
      return;
    }
    this.uploadProgress.set(0);
    this.api.createPostWithProgress(payload).subscribe({
      next: (event) => {
        if (!('result' in event)) {
          this.uploadProgress.set(event.progress);
          return;
        }
        this.uploadProgress.set(null);
        const row: PostRow = { ...event.result, pendingSync: false };
        void this.local.upsert(row);
        this.state.update((s) => (s.status === 'success' ? { ...s, data: [row, ...s.data] } : s));
      },
      error: (error: AppError) => {
        this.uploadProgress.set(null);
        if (error.kind !== 'network') {
          this.state.set({ status: 'error', error });
          return;
        }
        const tempId = `temp-${crypto.randomUUID()}`;
        const author = this.auth.currentUser();
        const optimisticPost: PostRow = {
          id: tempId,
          authorId: author?.id ?? '',
          authorName: author?.displayName ?? '',
          authorPhotoUrl: author?.photoUrl ?? '',
          title: payload.title,
          content: payload.content,
          // The local file URI itself, not a hosted URL: it is immediately
          // renderable on-device (the same path the camera/gallery picker
          // just returned), and gets replaced by the server's real
          // imageUrl once onSynced reconciles this row.
          imageUrl: payload.imageUri,
          createdAt: new Date().toISOString(),
          commentsCount: 0,
          likesCount: 0,
          isLikedByMe: false,
          pendingSync: true,
        };
        void this.local.upsert(optimisticPost);
        this.state.update((s) => (s.status === 'success' ? { ...s, data: [optimisticPost, ...s.data] } : s));
        void this.sync.enqueue('post', 'create', payload, tempId);
      },
    });
  }

  updatePost(id: string, payload: UpdatePostPayload): void {
    this.api.updatePost(id, payload).subscribe({
      next: (post) => {
        const row: PostRow = { ...post, pendingSync: false };
        void this.local.upsert(row);
        this.state.update((s) => (s.status === 'success' ? { ...s, data: s.data.map((p) => (p.id === id ? row : p)) } : s));
      },
      error: (error: AppError) => {
        if (error.kind !== 'network') {
          this.state.set({ status: 'error', error });
          return;
        }
        this.applyOptimistic(id, (post) => ({ ...post, ...payload, pendingSync: true }));
        // { id, ...payload } rather than nesting the changes under their own
        // key: this is exactly what the reconciler's replay(operation,
        // payload) needs to reconstruct api.updatePost(id, changes) later,
        // no separate lookup required.
        void this.sync.enqueue('post', 'update', { id, ...payload });
      },
    });
  }

  /**
   * A pending delete stays visible in `posts`' `data`, tagged
   * `pendingSync: true`, rather than disappearing immediately. Removing it
   * right away would mean putting it back if the write later turns out to
   * need retrying past this session (app restart, repeated offline
   * failures), which is a worse experience than showing it once with a
   * pending indicator until the deletion actually confirms.
   * `PostCardComponent` already hides edit/delete actions on a
   * `pendingSync` row, so there is nothing left to accidentally trigger
   * twice on a row that is already mid-delete.
   */
  deletePost(id: string): void {
    this.api.deletePost(id).subscribe({
      next: () => {
        void this.local.delete(id);
        this.state.update((s) => (s.status === 'success' ? { ...s, data: s.data.filter((post) => post.id !== id) } : s));
      },
      error: (error: AppError) => {
        if (error.kind !== 'network') {
          this.state.set({ status: 'error', error });
          return;
        }
        this.applyOptimistic(id, (post) => ({ ...post, pendingSync: true }));
        void this.sync.enqueue('post', 'delete', { id });
      },
    });
  }

  private applyOptimistic(id: string, update: (post: Post) => Post): void {
    this.state.update((s) => (s.status === 'success' ? { ...s, data: s.data.map((post) => (post.id === id ? update(post) : post)) } : s));
    void this.local.getAll().then((rows) => {
      const existing = rows.find((row) => row.id === id);
      if (!existing) {
        return;
      }
      void this.local.upsert(update(existing) as PostRow);
    });
  }
}
