import { Signal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AppError } from '../../core/models/app-error';
import { SyncService } from '../../core/offline/sync.service';
import { AuthService } from '../auth/auth.service';
import { User } from '../users/user.model';
import { CreateCommentPayload, CommentsApiService } from './comments-api.service';
import { CommentsLocalService } from './comments-local.service';
import { CommentsService } from './comments.service';
import { Comment } from './comment.model';

const author: User = {
  id: 'user-1',
  displayName: 'Ada Lovelace',
  email: 'ada@example.com',
  photoUrl: 'https://example.com/ada.jpg',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const sampleComment: Comment = {
  id: 'comment-1',
  postId: 'post-1',
  authorId: 'user-1',
  authorName: 'Ada Lovelace',
  authorPhotoUrl: 'https://example.com/ada.jpg',
  content: 'Great post!',
  createdAt: '2024-01-15T09:45:00.000Z',
};

const networkError: AppError = { kind: 'network', message: 'No connection to the server.' };

class FakeAuthService {
  private readonly userSignal = signal<User | null>(author);
  readonly currentUser: Signal<User | null> = this.userSignal.asReadonly();
}

describe('CommentsService', () => {
  let service: CommentsService;
  let fakeApi: jasmine.SpyObj<CommentsApiService>;
  let fakeLocal: jasmine.SpyObj<CommentsLocalService>;
  let fakeSync: jasmine.SpyObj<SyncService>;

  beforeEach(() => {
    fakeApi = jasmine.createSpyObj<CommentsApiService>('CommentsApiService', [
      'getComments',
      'addComment',
      'deleteComment',
    ]);
    fakeLocal = jasmine.createSpyObj<CommentsLocalService>('CommentsLocalService', [
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
        { provide: CommentsApiService, useValue: fakeApi },
        { provide: CommentsLocalService, useValue: fakeLocal },
        { provide: AuthService, useValue: new FakeAuthService() },
        { provide: SyncService, useValue: fakeSync },
      ],
    });

    service = TestBed.inject(CommentsService);
  });

  describe('addComment validation', () => {
    it('rejects empty content before calling the API service', () => {
      service.addComment('post-1', '');

      // State must remain idle (unchanged) so a loaded comment list is never
      // clobbered by a transient validation failure — CommentInputComponent
      // already guards before reaching here.
      expect(service.comments()).toEqual({ status: 'idle' });
      expect(fakeApi.addComment).not.toHaveBeenCalled();
    });

    it('rejects whitespace-only content before calling the API service', () => {
      service.addComment('post-1', '   ');

      expect(service.comments()).toEqual({ status: 'idle' });
      expect(fakeApi.addComment).not.toHaveBeenCalled();
    });
  });

  describe('addComment on a network error', () => {
    it('upserts a pendingSync row under a temp- id, enqueues the write, and prepends the optimistic row', async () => {
      fakeApi.addComment.and.returnValue(throwError(() => networkError));

      const payload: CreateCommentPayload = { postId: 'post-1', content: 'Written while offline.' };
      service.addComment(payload.postId, payload.content);

      // Allow the void upsert and enqueue promises to settle
      await Promise.resolve();

      const state = service.comments();
      expect(state.status).toBe('success');
      if (state.status !== 'success') {
        return;
      }

      expect(state.data.length).toBe(1);
      const optimisticComment = state.data[0];
      expect(optimisticComment.id.startsWith('temp-')).toBeTrue();
      expect(optimisticComment.pendingSync).toBeTrue();
      expect(optimisticComment.content).toBe(payload.content);
      expect(optimisticComment.postId).toBe(payload.postId);
      expect(optimisticComment.authorId).toBe(author.id);

      expect(fakeLocal.upsert).toHaveBeenCalledWith(
        jasmine.objectContaining({ id: optimisticComment.id, pendingSync: true }),
      );

      expect(fakeSync.enqueue).toHaveBeenCalledWith('comment', 'create', payload, optimisticComment.id);
    });

    it('surfaces a non-network error without upserting anything or enqueuing', () => {
      const serverError: AppError = { kind: 'server', message: 'Unexpected server error.', statusCode: 500 };
      fakeApi.addComment.and.returnValue(throwError(() => serverError));

      service.addComment('post-1', 'Some content');

      expect(service.comments()).toEqual({ status: 'error', error: serverError });
      expect(fakeLocal.upsert).not.toHaveBeenCalled();
      expect(fakeSync.enqueue).not.toHaveBeenCalled();
    });

    it('prepends the comment on a successful response', () => {
      fakeApi.addComment.and.returnValue(of(sampleComment));

      service.addComment('post-1', sampleComment.content);

      expect(service.comments()).toEqual({
        status: 'success',
        postId: 'post-1',
        data: [{ ...sampleComment, pendingSync: false }],
        nextCursor: null,
      });
      expect(fakeLocal.upsert).toHaveBeenCalledWith({ ...sampleComment, pendingSync: false });
    });
  });
});
