import { Signal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { PostCardComponent } from '../../../../shared/components/post-card/post-card.component';
import { AuthService } from '../../../auth/auth.service';
import { User } from '../../../users/user.model';
import { PostRow } from '../../post.model';
import { PostsService, PostsState } from '../../posts.service';
import { FeedPage } from './feed.page';

const currentUser: User = {
  id: 'user-1',
  displayName: 'Ada Lovelace',
  email: 'ada@example.com',
  photoUrl: 'https://example.com/ada.jpg',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const basePost: PostRow = {
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

const otherAuthorPost: PostRow = {
  ...basePost,
  id: 'post-2',
  authorId: 'user-2',
  authorName: 'Grace Hopper',
  title: 'Written by another author',
  pendingSync: false,
};

const ownedPendingPost: PostRow = {
  ...basePost,
  id: 'post-3',
  title: 'Owned but still syncing',
  pendingSync: true,
};

class FakePostsService {
  private readonly postsSignal = signal<PostsState>({ status: 'idle' });
  readonly posts: Signal<PostsState> = this.postsSignal.asReadonly();
  readonly loadPosts = jasmine.createSpy('loadPosts');
  readonly loadMore = jasmine.createSpy('loadMore');
  readonly deletePost = jasmine.createSpy('deletePost');

  setState(state: PostsState): void {
    this.postsSignal.set(state);
  }
}

class FakeAuthService {
  private readonly userSignal = signal<User | null>(currentUser);
  readonly currentUser: Signal<User | null> = this.userSignal.asReadonly();
}

describe('FeedPage', () => {
  let fixture: ComponentFixture<FeedPage>;
  let fakePostsService: FakePostsService;

  beforeEach(async () => {
    // Real `PostCardComponent`s render `CachedImageDirective`, which
    // otherwise fires a real `fetch()` against `authorPhotoUrl` the moment
    // change detection runs; none of this suite's assertions care what
    // that directive renders, only stubbing it out so no real network
    // request escapes this test.
    spyOn(window, 'fetch').and.rejectWith(new Error('no network in tests'));

    fakePostsService = new FakePostsService();

    await TestBed.configureTestingModule({
      imports: [FeedPage],
      providers: [
        provideIonicAngular(),
        provideNoopAnimations(),
        provideRouter([]),
        { provide: PostsService, useValue: fakePostsService },
        { provide: AuthService, useValue: new FakeAuthService() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FeedPage);
  });

  it('loads the feed once on construction', () => {
    fixture.detectChanges();

    expect(fakePostsService.loadPosts).toHaveBeenCalled();
  });

  it('renders one PostCardComponent per item from a mocked response', () => {
    fakePostsService.setState({ status: 'success', data: [basePost, otherAuthorPost, ownedPendingPost], nextCursor: null });
    fixture.detectChanges();

    const cards = fixture.debugElement.queryAll(By.css('app-post-card'));
    expect(cards.length).toBe(3);
  });

  it('shows the delete action only for the genuinely-owned, already-synced post', () => {
    fakePostsService.setState({ status: 'success', data: [basePost, otherAuthorPost, ownedPendingPost], nextCursor: null });
    fixture.detectChanges();

    const cards = fixture.debugElement.queryAll(By.css('app-post-card'));
    const cardComponents = cards.map((card) => card.componentInstance as PostCardComponent);

    expect(cardComponents[0].isOwnPost()).toBeTrue();
    expect(cardComponents[0].canManage()).toBeTrue();
    expect(cards[0].query(By.css('[aria-label="Delete post"]'))).not.toBeNull();

    expect(cardComponents[1].isOwnPost()).toBeFalse();
    expect(cardComponents[1].canManage()).toBeFalse();
    expect(cards[1].query(By.css('[aria-label="Delete post"]'))).toBeNull();

    expect(cardComponents[2].isOwnPost()).toBeTrue();
    expect(cardComponents[2].canManage()).toBeFalse();
    expect(cards[2].query(By.css('[aria-label="Delete post"]'))).toBeNull();
  });

  it('calls PostsService.deletePost when a card emits delete', () => {
    fakePostsService.setState({ status: 'success', data: [basePost], nextCursor: null });
    fixture.detectChanges();

    const card = fixture.debugElement.query(By.css('app-post-card'));
    card.triggerEventHandler('delete', undefined);

    expect(fakePostsService.deletePost).toHaveBeenCalledWith(basePost.id);
  });

  it('renders an empty state when the feed has no posts', () => {
    fakePostsService.setState({ status: 'success', data: [], nextCursor: null });
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('app-post-card'))).toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No posts yet.');
  });

  it('renders an ErrorViewComponent when the feed fails to load', () => {
    fakePostsService.setState({ status: 'error', error: { kind: 'server', message: 'Unexpected server error.', statusCode: 500 } });
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('app-error-view'))).not.toBeNull();
  });
});
