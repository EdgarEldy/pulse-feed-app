import { Signal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Router, provideRouter } from '@angular/router';
import { ModalController, provideIonicAngular } from '@ionic/angular/standalone';
import { AuthService } from '../../../auth/auth.service';
import { CommentsService, CommentsState } from '../../../comments/comments.service';
import { LikeState, LikesService } from '../../../likes/likes.service';
import { provideTestTranslations } from '../../../../testing/translate-testing';
import { User } from '../../../users/user.model';
import { PostDetailState, PostsService } from '../../posts.service';
import { PostDetailPage } from './post-detail.page';

const currentUser: User = {
  id: 'user-1',
  displayName: 'Ada Lovelace',
  email: 'ada@example.com',
  photoUrl: 'https://example.com/ada.jpg',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const ownPost = {
  id: 'post-1',
  authorId: currentUser.id,
  authorName: currentUser.displayName,
  authorPhotoUrl: currentUser.photoUrl,
  title: 'Owned and synced',
  content: 'Can be edited and deleted.',
  createdAt: '2024-01-01T00:00:00.000Z',
  commentsCount: 0,
  likesCount: 0,
  isLikedByMe: false,
  pendingSync: false,
};

class FakePostsService {
  private readonly detailSignal = signal<PostDetailState>({ status: 'idle' });
  readonly postDetail: Signal<PostDetailState> = this.detailSignal.asReadonly();
  readonly loadPost = jasmine.createSpy('loadPost');
  readonly deletePost = jasmine.createSpy('deletePost');

  setState(state: PostDetailState): void {
    this.detailSignal.set(state);
  }
}

class FakeAuthService {
  private readonly userSignal = signal<User | null>(currentUser);
  readonly currentUser: Signal<User | null> = this.userSignal.asReadonly();
}

class FakeLikesService {
  private readonly statesMap = signal(new Map<string, LikeState>());
  readonly states: Signal<Map<string, LikeState>> = this.statesMap.asReadonly();
  readonly initPost = jasmine.createSpy('initPost');
  readonly toggle = jasmine.createSpy('toggle');
  readonly getStatus = jasmine.createSpy('getStatus');
}

class FakeCommentsService {
  private readonly commentsSignal = signal<CommentsState>({ status: 'idle' });
  readonly comments: Signal<CommentsState> = this.commentsSignal.asReadonly();
  readonly loadComments = jasmine.createSpy('loadComments');
  readonly loadMore = jasmine.createSpy('loadMore');
  readonly addComment = jasmine.createSpy('addComment');
  readonly deleteComment = jasmine.createSpy('deleteComment');
}

describe('PostDetailPage', () => {
  let fixture: ComponentFixture<PostDetailPage>;
  let fakePostsService: FakePostsService;
  let router: Router;

  beforeEach(async () => {
    // Avoids `CachedImageDirective` firing a real `fetch()` for the author
    // avatar/post image the moment change detection runs.
    spyOn(window, 'fetch').and.rejectWith(new Error('no network in tests'));

    fakePostsService = new FakePostsService();

    await TestBed.configureTestingModule({
      imports: [PostDetailPage],
      providers: [
        provideIonicAngular(),
        provideNoopAnimations(),
        provideRouter([]),
        provideTestTranslations(),
        { provide: PostsService, useValue: fakePostsService },
        { provide: AuthService, useValue: new FakeAuthService() },
        { provide: LikesService, useValue: new FakeLikesService() },
        { provide: CommentsService, useValue: new FakeCommentsService() },
        { provide: ModalController, useValue: jasmine.createSpyObj<ModalController>('ModalController', ['create']) },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PostDetailPage);
    router = TestBed.inject(Router);
    spyOn(router, 'navigateByUrl').and.resolveTo(true);
  });

  it('loads the post whenever the id input changes', () => {
    fixture.componentRef.setInput('id', 'post-1');
    fixture.detectChanges();
    TestBed.tick();

    expect(fakePostsService.loadPost).toHaveBeenCalledWith('post-1');

    fixture.componentRef.setInput('id', 'post-2');
    fixture.detectChanges();
    TestBed.tick();

    expect(fakePostsService.loadPost).toHaveBeenCalledWith('post-2');
  });

  it('allows managing a post authored by the current user that is already synced', () => {
    fixture.componentRef.setInput('id', 'post-1');
    fakePostsService.setState({ status: 'success', data: ownPost });
    fixture.detectChanges();

    expect(fixture.componentInstance.canManage()).toBeTrue();
  });

  it('disallows managing a post authored by someone else', () => {
    fixture.componentRef.setInput('id', 'post-1');
    fakePostsService.setState({ status: 'success', data: { ...ownPost, authorId: 'user-2' } });
    fixture.detectChanges();

    expect(fixture.componentInstance.canManage()).toBeFalse();
  });

  it('disallows managing an own post that is still pendingSync', () => {
    fixture.componentRef.setInput('id', 'post-1');
    fakePostsService.setState({ status: 'success', data: { ...ownPost, pendingSync: true } });
    fixture.detectChanges();

    expect(fixture.componentInstance.canManage()).toBeFalse();
  });

  it('hides the edit/delete toolbar buttons when canManage is false', () => {
    fixture.componentRef.setInput('id', 'post-1');
    fakePostsService.setState({ status: 'success', data: { ...ownPost, authorId: 'user-2' } });
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('[aria-label="Delete post"]'))).toBeNull();
  });

  it('calls PostsService.deletePost and navigates back to the feed on delete', () => {
    fixture.componentRef.setInput('id', 'post-1');
    fakePostsService.setState({ status: 'success', data: ownPost });
    fixture.detectChanges();

    fixture.componentInstance.onDelete();

    expect(fakePostsService.deletePost).toHaveBeenCalledWith('post-1');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/feed');
  });

  it('reloads the post when retrying after an error', () => {
    fixture.componentRef.setInput('id', 'post-1');
    fakePostsService.setState({ status: 'error', error: { kind: 'server', message: 'Unexpected server error.', statusCode: 500 } });
    fixture.detectChanges();
    fakePostsService.loadPost.calls.reset();

    fixture.componentInstance.onRetry();

    expect(fakePostsService.loadPost).toHaveBeenCalledWith('post-1');
  });

  it('renders an ErrorViewComponent when the post fails to load', () => {
    fixture.componentRef.setInput('id', 'post-1');
    fakePostsService.setState({ status: 'error', error: { kind: 'server', message: 'Unexpected server error.', statusCode: 500 } });
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('app-error-view'))).not.toBeNull();
  });
});
