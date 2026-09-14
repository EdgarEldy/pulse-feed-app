import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { AppError } from '../../core/models/app-error';
import { SyncService } from '../../core/offline/sync.service';
import { LikesApiService } from './likes-api.service';
import { LikesService } from './likes.service';

const networkError: AppError = { kind: 'network', message: 'No connection to the server.' };

describe('LikesService', () => {
  let service: LikesService;
  let fakeApi: jasmine.SpyObj<LikesApiService>;
  let fakeSync: jasmine.SpyObj<SyncService>;

  beforeEach(() => {
    fakeApi = jasmine.createSpyObj<LikesApiService>('LikesApiService', ['toggle', 'getStatus']);
    fakeSync = jasmine.createSpyObj<SyncService>('SyncService', ['enqueue']);
    fakeSync.enqueue.and.resolveTo();

    TestBed.configureTestingModule({
      providers: [
        { provide: LikesApiService, useValue: fakeApi },
        { provide: SyncService, useValue: fakeSync },
      ],
    });

    service = TestBed.inject(LikesService);
  });

  describe('initPost', () => {
    it('seeds the state for a post that has not been registered yet', () => {
      service.initPost('post-1', 10, true);

      const state = service.states().get('post-1');
      expect(state?.isLiked).toBeTrue();
      expect(state?.likesCount).toBe(10);
    });

    it('leaves existing state unchanged when called a second time for the same post', () => {
      service.initPost('post-1', 10, true);
      service.initPost('post-1', 99, false);

      const state = service.states().get('post-1');
      expect(state?.isLiked).toBeTrue();
      expect(state?.likesCount).toBe(10);
    });
  });

  describe('toggle', () => {
    it('maps the API response to the correct liked state and count', () => {
      service.initPost('post-1', 5, false);
      fakeApi.toggle.and.returnValue(of({ liked: true, likesCount: 6 }));

      service.toggle('post-1');

      const state = service.states().get('post-1');
      expect(state?.isLiked).toBeTrue();
      expect(state?.likesCount).toBe(6);
    });

    it('replaces an optimistic guess with the authoritative server values on success', () => {
      service.initPost('post-1', 5, true);
      // Server disagrees with the optimistic flip and returns the same liked=true
      fakeApi.toggle.and.returnValue(of({ liked: false, likesCount: 4 }));

      service.toggle('post-1');

      const state = service.states().get('post-1');
      expect(state?.isLiked).toBeFalse();
      expect(state?.likesCount).toBe(4);
    });

    it('applies the optimistic flip immediately before the request settles', () => {
      service.initPost('post-1', 5, false);
      // Use a Subject so the observable never emits, simulating an in-flight request
      const pending$ = new Subject<{ liked: boolean; likesCount: number }>();
      fakeApi.toggle.and.returnValue(pending$.asObservable());

      service.toggle('post-1');

      // Even though the request has not settled, the state should already be flipped
      const state = service.states().get('post-1');
      expect(state?.isLiked).toBeTrue();
      expect(state?.likesCount).toBe(6);
    });

    it('keeps the optimistic state and enqueues the write without a tempId on a network error', () => {
      service.initPost('post-1', 5, false);
      fakeApi.toggle.and.returnValue(throwError(() => networkError));

      service.toggle('post-1');

      // Optimistic flip was applied before the error arrived
      const state = service.states().get('post-1');
      expect(state?.isLiked).toBeTrue();

      expect(fakeSync.enqueue).toHaveBeenCalledWith('like', 'update', { postId: 'post-1' });
    });

    it('reverts the optimistic flip on a non-network server error', () => {
      service.initPost('post-1', 5, false);
      const serverError: AppError = { kind: 'server', message: 'Post not found.', statusCode: 404 };
      fakeApi.toggle.and.returnValue(throwError(() => serverError));

      service.toggle('post-1');

      // State should be reverted back to the original values
      const state = service.states().get('post-1');
      expect(state?.isLiked).toBeFalse();
      expect(state?.likesCount).toBe(5);
      expect(fakeSync.enqueue).not.toHaveBeenCalled();
    });

    it('does nothing when the post has not been initialized yet', () => {
      fakeApi.toggle.and.returnValue(of({ liked: true, likesCount: 1 }));

      // toggle without initPost — should be a no-op
      service.toggle('unknown-post');

      expect(fakeApi.toggle).not.toHaveBeenCalled();
      expect(service.states().has('unknown-post')).toBeFalse();
    });
  });

  describe('getStatus', () => {
    it('updates isLiked from the API response without changing likesCount', () => {
      service.initPost('post-1', 7, false);
      fakeApi.getStatus.and.returnValue(of({ liked: true }));

      service.getStatus('post-1');

      const state = service.states().get('post-1');
      expect(state?.isLiked).toBeTrue();
      expect(state?.likesCount).toBe(7);
    });

    it('silently swallows a status fetch error without corrupting the displayed count', () => {
      service.initPost('post-1', 7, false);
      fakeApi.getStatus.and.returnValue(throwError(() => networkError));

      expect(() => service.getStatus('post-1')).not.toThrow();

      const state = service.states().get('post-1');
      expect(state?.isLiked).toBeFalse();
      expect(state?.likesCount).toBe(7);
    });
  });
});
