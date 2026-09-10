import { Signal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, throwError } from 'rxjs';
import { AppError } from '../../core/models/app-error';
import { PendingWriteReconciler, SyncService } from '../../core/offline/sync.service';
import { AuthService } from '../auth/auth.service';
import { User } from '../users/user.model';
import { CreatePostPayload, PostsApiService, UpdatePostPayload } from './posts-api.service';
import { PostsLocalService } from './posts-local.service';
import { PostsService } from './posts.service';
import { Post, PostRow } from './post.model';

const author: User = {
  id: 'user-1',
  displayName: 'Ada Lovelace',
  email: 'ada@example.com',
  photoUrl: 'https://example.com/ada.jpg',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const samplePost: Post = {
  id: 'post-1',
  authorId: 'user-1',
  authorName: 'Ada Lovelace',
  authorPhotoUrl: 'https://example.com/ada.jpg',
  title: 'Hello world',
  content: 'My first post',
  createdAt: '2024-01-01T00:00:00.000Z',
  commentsCount: 0,
  likesCount: 0,
  isLikedByMe: false,
};

const networkError: AppError = { kind: 'network', message: 'No connection to the server.' };

class FakeAuthService {
  private readonly userSignal = signal<User | null>(author);
  readonly currentUser: Signal<User | null> = this.userSignal.asReadonly();
}

/**
 * `loadOfflineFirst`'s cache-write and cache-fallback branches wrap a
 * `Promise` (`from(Promise.resolve(...))`), so `PostsService.loadPosts`
 * settles a microtask turn or two after being called, unlike
 * `createPost`/`updatePost`/`deletePost`, which subscribe directly to a
 * synchronous `of`/`throwError` from the mocked `PostsApiService`. A
 * `setTimeout(0)` macrotask flush drains every pending microtask first,
 * regardless of how many hops the chain happens to take, the same
 * technique `avatar-picker.component.spec.ts` uses for its own
 * Promise-chained flow.
 */
function flushLoad(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('PostsService', () => {
  let service: PostsService;
  let fakeApi: jasmine.SpyObj<PostsApiService>;
  let fakeLocal: jasmine.SpyObj<PostsLocalService>;
  let fakeSync: jasmine.SpyObj<SyncService>;

  beforeEach(() => {
    fakeApi = jasmine.createSpyObj<PostsApiService>('PostsApiService', [
      'getPosts',
      'getPost',
      'createPost',
      'createPostWithProgress',
      'updatePost',
      'deletePost',
    ]);
    fakeLocal = jasmine.createSpyObj<PostsLocalService>('PostsLocalService', [
      'getAll',
      'upsert',
      'upsertAll',
      'delete',
      'replaceId',
    ]);
    fakeSync = jasmine.createSpyObj<SyncService>('SyncService', ['register', 'enqueue']);

    fakeLocal.getAll.and.resolveTo([]);
    fakeLocal.upsert.and.resolveTo();
    fakeLocal.upsertAll.and.resolveTo();
    fakeLocal.delete.and.resolveTo();
    fakeLocal.replaceId.and.resolveTo();
    fakeSync.enqueue.and.resolveTo();

    TestBed.configureTestingModule({
      providers: [
        { provide: PostsApiService, useValue: fakeApi },
        { provide: PostsLocalService, useValue: fakeLocal },
        { provide: AuthService, useValue: new FakeAuthService() },
        { provide: SyncService, useValue: fakeSync },
      ],
    });

    service = TestBed.inject(PostsService);
  });

  function registeredReconciler(): PendingWriteReconciler<Post | null> {
    return fakeSync.register.calls.mostRecent().args[0] as PendingWriteReconciler<Post | null>;
  }

  describe('createPost validation', () => {
    it('rejects an empty title before calling the API service', () => {
      service.createPost({ title: '   ', content: 'Some content' });

      expect(service.posts()).toEqual({
        status: 'error',
        error: { kind: 'validation', message: 'Title and content are required.' },
      });
      expect(fakeApi.createPostWithProgress).not.toHaveBeenCalled();
    });

    it('rejects empty content before calling the API service', () => {
      service.createPost({ title: 'Some title', content: '   ' });

      expect(service.posts()).toEqual({
        status: 'error',
        error: { kind: 'validation', message: 'Title and content are required.' },
      });
      expect(fakeApi.createPostWithProgress).not.toHaveBeenCalled();
    });
  });

  describe('createPost on a network error', () => {
    it('upserts a pendingSync row under a temp- id and enqueues the write', async () => {
      fakeApi.getPosts.and.returnValue(of({ items: [], nextCursor: null }));
      service.loadPosts();
      await flushLoad();
      expect(service.posts()).toEqual({ status: 'success', data: [], nextCursor: null });

      const payload: CreatePostPayload = { title: 'Offline post', content: 'Written offline' };
      fakeApi.createPostWithProgress.and.returnValue(throwError(() => networkError));

      service.createPost(payload);

      const state = service.posts();
      expect(state.status).toBe('success');
      if (state.status !== 'success') {
        return;
      }
      expect(state.data.length).toBe(1);
      const optimisticPost = state.data[0];
      expect(optimisticPost.id.startsWith('temp-')).toBeTrue();
      expect(optimisticPost.pendingSync).toBeTrue();
      expect(optimisticPost.title).toBe(payload.title);
      expect(optimisticPost.content).toBe(payload.content);
      expect(optimisticPost.authorId).toBe(author.id);

      expect(fakeSync.enqueue).toHaveBeenCalledWith('post', 'create', payload, optimisticPost.id);
      expect(service.createProgress()).toBeNull();
    });

    it('surfaces a non-network error without upserting anything or enqueuing', async () => {
      fakeApi.getPosts.and.returnValue(of({ items: [], nextCursor: null }));
      service.loadPosts();
      await flushLoad();

      const serverError: AppError = { kind: 'server', message: 'Unexpected server error.', statusCode: 500 };
      fakeApi.createPostWithProgress.and.returnValue(throwError(() => serverError));

      service.createPost({ title: 'A title', content: 'Some content' });

      expect(service.posts()).toEqual({ status: 'error', error: serverError });
      expect(fakeLocal.upsert).not.toHaveBeenCalled();
      expect(fakeSync.enqueue).not.toHaveBeenCalled();
    });

    it('prepends the created post on a successful response', async () => {
      fakeApi.getPosts.and.returnValue(of({ items: [], nextCursor: null }));
      service.loadPosts();
      await flushLoad();

      fakeApi.createPostWithProgress.and.returnValue(of({ progress: 100, result: samplePost }));

      service.createPost({ title: samplePost.title, content: samplePost.content });

      expect(service.posts()).toEqual({
        status: 'success',
        data: [{ ...samplePost, pendingSync: false }],
        nextCursor: null,
      });
      expect(fakeLocal.upsert).toHaveBeenCalledWith({ ...samplePost, pendingSync: false });
    });
  });

  describe('registered post reconciler', () => {
    it('onSynced replaces the temporary row in PostsLocalService and in the posts signal', async () => {
      fakeApi.getPosts.and.returnValue(of({ items: [], nextCursor: null }));
      service.loadPosts();
      await flushLoad();

      fakeApi.createPostWithProgress.and.returnValue(throwError(() => networkError));
      service.createPost({ title: 'Offline post', content: 'Written offline' });

      const stateBeforeSync = service.posts();
      expect(stateBeforeSync.status).toBe('success');
      if (stateBeforeSync.status !== 'success') {
        return;
      }
      const tempId = stateBeforeSync.data[0].id;

      const syncedPost: Post = { ...samplePost, id: 'post-real-1' };
      const reconciler = registeredReconciler();
      await reconciler.onSynced(tempId, syncedPost);

      const expectedRow: PostRow = { ...syncedPost, pendingSync: false };
      expect(fakeLocal.replaceId).toHaveBeenCalledWith(tempId, expectedRow);

      const finalState = service.posts();
      expect(finalState.status).toBe('success');
      if (finalState.status !== 'success') {
        return;
      }
      expect(finalState.data.find((post) => post.id === tempId)).toBeUndefined();
      expect(finalState.data.find((post) => post.id === 'post-real-1')).toEqual(expectedRow);
    });

    it('onSynced is a no-op when replaying an update/delete, which never passes a synced value', async () => {
      const reconciler = registeredReconciler();

      await expectAsync(reconciler.onSynced('temp-1', null)).toBeResolved();
      expect(fakeLocal.replaceId).not.toHaveBeenCalled();
    });

    it('replay dispatches create/update/delete to the matching API method', async () => {
      const reconciler = registeredReconciler();

      const createPayload: CreatePostPayload = { title: 'Title', content: 'Content' };
      fakeApi.createPost.and.returnValue(of(samplePost));
      await firstValueFrom(reconciler.replay('create', createPayload));
      expect(fakeApi.createPost).toHaveBeenCalledWith(createPayload);

      const updatePayload: { id: string } & UpdatePostPayload = { id: 'post-1', title: 'Updated' };
      fakeApi.updatePost.and.returnValue(of(samplePost));
      await firstValueFrom(reconciler.replay('update', updatePayload));
      expect(fakeApi.updatePost).toHaveBeenCalledWith('post-1', { title: 'Updated' });

      fakeApi.deletePost.and.returnValue(of(undefined));
      const deleted = await firstValueFrom(reconciler.replay('delete', { id: 'post-1' }));
      expect(fakeApi.deletePost).toHaveBeenCalledWith('post-1');
      expect(deleted).toBeNull();
    });
  });

  describe('loadPosts', () => {
    it('sets a success state from a remote response and writes through to the cache', async () => {
      fakeApi.getPosts.and.returnValue(of({ items: [samplePost], nextCursor: 'cursor-2' }));

      service.loadPosts();
      await flushLoad();

      expect(service.posts()).toEqual({
        status: 'success',
        data: [{ ...samplePost, pendingSync: false }],
        nextCursor: 'cursor-2',
      });
      expect(fakeLocal.upsertAll).toHaveBeenCalledWith([{ ...samplePost, pendingSync: false }]);
    });

    it('falls back to the local cache, with a null nextCursor, on a network error', async () => {
      const cachedRow: PostRow = { ...samplePost, pendingSync: true };
      fakeApi.getPosts.and.returnValue(throwError(() => networkError));
      fakeLocal.getAll.and.resolveTo([cachedRow]);

      service.loadPosts();
      await flushLoad();

      expect(service.posts()).toEqual({ status: 'success', data: [cachedRow], nextCursor: null });
    });

    it('surfaces a non-network error without falling back to the cache', async () => {
      const serverError: AppError = { kind: 'server', message: 'Unexpected server error.', statusCode: 500 };
      fakeApi.getPosts.and.returnValue(throwError(() => serverError));

      service.loadPosts();
      await flushLoad();

      expect(service.posts()).toEqual({ status: 'error', error: serverError });
      expect(fakeLocal.getAll).not.toHaveBeenCalled();
    });
  });

  describe('loadMore', () => {
    it('appends the next page and advances nextCursor on success', async () => {
      fakeApi.getPosts.and.returnValue(of({ items: [samplePost], nextCursor: 'cursor-2' }));
      service.loadPosts();
      await flushLoad();

      const secondPost: Post = { ...samplePost, id: 'post-2' };
      fakeApi.getPosts.and.returnValue(of({ items: [secondPost], nextCursor: null }));

      service.loadMore();

      expect(fakeApi.getPosts).toHaveBeenCalledWith('cursor-2');
      expect(service.posts()).toEqual({
        status: 'success',
        data: [{ ...samplePost, pendingSync: false }, { ...secondPost, pendingSync: false }],
        nextCursor: null,
      });
    });

    it('sets an error state, without offline fallback, when the request fails', async () => {
      fakeApi.getPosts.and.returnValue(of({ items: [samplePost], nextCursor: 'cursor-2' }));
      service.loadPosts();
      await flushLoad();

      fakeApi.getPosts.and.returnValue(throwError(() => networkError));

      service.loadMore();

      expect(service.posts()).toEqual({ status: 'error', error: networkError });
      expect(fakeLocal.getAll).not.toHaveBeenCalled();
    });

    it('does nothing when there is no next page', async () => {
      fakeApi.getPosts.and.returnValue(of({ items: [samplePost], nextCursor: null }));
      service.loadPosts();
      await flushLoad();
      fakeApi.getPosts.calls.reset();

      service.loadMore();

      expect(fakeApi.getPosts).not.toHaveBeenCalled();
    });
  });

  describe('updatePost', () => {
    it('replaces the post in place on success', async () => {
      fakeApi.getPosts.and.returnValue(of({ items: [samplePost], nextCursor: null }));
      service.loadPosts();
      await flushLoad();

      const updated: Post = { ...samplePost, title: 'Updated title' };
      fakeApi.updatePost.and.returnValue(of(updated));

      service.updatePost('post-1', { title: 'Updated title' });

      expect(service.posts()).toEqual({
        status: 'success',
        data: [{ ...updated, pendingSync: false }],
        nextCursor: null,
      });
    });

    it('queues the write and marks the post pendingSync on a network error', async () => {
      fakeApi.getPosts.and.returnValue(of({ items: [samplePost], nextCursor: null }));
      service.loadPosts();
      await flushLoad();
      const cachedRow: PostRow = { ...samplePost, pendingSync: false };
      fakeLocal.getAll.and.resolveTo([cachedRow]);

      fakeApi.updatePost.and.returnValue(throwError(() => networkError));

      service.updatePost('post-1', { title: 'Updated offline' });

      const state = service.posts();
      expect(state.status).toBe('success');
      if (state.status === 'success') {
        expect(state.data[0].pendingSync).toBeTrue();
        expect(state.data[0].title).toBe('Updated offline');
      }
      expect(fakeSync.enqueue).toHaveBeenCalledWith('post', 'update', { id: 'post-1', title: 'Updated offline' });

      await flushLoad();
      expect(fakeLocal.upsert).toHaveBeenCalledWith({ ...cachedRow, title: 'Updated offline', pendingSync: true });
    });

    it('surfaces a non-network error without queuing anything', async () => {
      fakeApi.getPosts.and.returnValue(of({ items: [samplePost], nextCursor: null }));
      service.loadPosts();
      await flushLoad();

      const unauthorizedError: AppError = { kind: 'unauthorized', message: 'Session expired.' };
      fakeApi.updatePost.and.returnValue(throwError(() => unauthorizedError));

      service.updatePost('post-1', { title: 'Updated offline' });

      expect(service.posts()).toEqual({ status: 'error', error: unauthorizedError });
      expect(fakeSync.enqueue).not.toHaveBeenCalled();
    });
  });

  describe('deletePost', () => {
    it('removes the post from the feed on success', async () => {
      fakeApi.getPosts.and.returnValue(of({ items: [samplePost], nextCursor: null }));
      service.loadPosts();
      await flushLoad();

      fakeApi.deletePost.and.returnValue(of(undefined));

      service.deletePost('post-1');

      expect(service.posts()).toEqual({ status: 'success', data: [], nextCursor: null });
      expect(fakeLocal.delete).toHaveBeenCalledWith('post-1');
    });

    it('marks the post pendingSync and queues the delete on a network error', async () => {
      fakeApi.getPosts.and.returnValue(of({ items: [samplePost], nextCursor: null }));
      service.loadPosts();
      await flushLoad();

      fakeApi.deletePost.and.returnValue(throwError(() => networkError));

      service.deletePost('post-1');

      const state = service.posts();
      expect(state.status).toBe('success');
      if (state.status === 'success') {
        expect(state.data[0].pendingSync).toBeTrue();
      }
      expect(fakeSync.enqueue).toHaveBeenCalledWith('post', 'delete', { id: 'post-1' });
      expect(fakeLocal.delete).not.toHaveBeenCalled();
    });

    it('surfaces a non-network error without queuing anything', async () => {
      fakeApi.getPosts.and.returnValue(of({ items: [samplePost], nextCursor: null }));
      service.loadPosts();
      await flushLoad();

      const serverError: AppError = { kind: 'server', message: 'Unexpected server error.', statusCode: 500 };
      fakeApi.deletePost.and.returnValue(throwError(() => serverError));

      service.deletePost('post-1');

      expect(service.posts()).toEqual({ status: 'error', error: serverError });
      expect(fakeSync.enqueue).not.toHaveBeenCalled();
    });
  });
});
