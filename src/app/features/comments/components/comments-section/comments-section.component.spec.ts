import { Signal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ModalController, provideIonicAngular } from '@ionic/angular/standalone';
import { provideTestTranslations } from '../../../../testing/translate-testing';
import { AuthService } from '../../../auth/auth.service';
import { User } from '../../../users/user.model';
import { CommentRow } from '../../comment.model';
import { CommentsService, CommentsState } from '../../comments.service';
import { CommentsSectionComponent } from './comments-section.component';

const currentUser: User = {
  id: 'user-1',
  displayName: 'Ada Lovelace',
  email: 'ada@example.com',
  photoUrl: 'https://example.com/ada.jpg',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const postAuthorId = 'user-2';

const ownComment: CommentRow = {
  id: 'comment-1',
  postId: 'post-1',
  authorId: currentUser.id,
  authorName: currentUser.displayName,
  authorPhotoUrl: currentUser.photoUrl,
  content: 'My own comment',
  createdAt: '2024-01-01T00:00:00.000Z',
  pendingSync: false,
};

const otherAuthorComment: CommentRow = {
  ...ownComment,
  id: 'comment-2',
  authorId: 'user-3',
  authorName: 'Grace Hopper',
  content: 'Somebody else entirely',
};

const pendingOwnComment: CommentRow = {
  ...ownComment,
  id: 'comment-3',
  content: 'Still syncing',
  pendingSync: true,
};

class FakeCommentsService {
  private readonly commentsSignal = signal<CommentsState>({ status: 'idle' });
  readonly comments: Signal<CommentsState> = this.commentsSignal.asReadonly();
  readonly loadComments = jasmine.createSpy('loadComments');
  readonly loadMore = jasmine.createSpy('loadMore');
  readonly addComment = jasmine.createSpy('addComment');
  readonly deleteComment = jasmine.createSpy('deleteComment');

  setState(state: CommentsState): void {
    this.commentsSignal.set(state);
  }
}

class FakeAuthService {
  private readonly userSignal = signal<User | null>(currentUser);
  readonly currentUser: Signal<User | null> = this.userSignal.asReadonly();
}

describe('CommentsSectionComponent', () => {
  let fixture: ComponentFixture<CommentsSectionComponent>;
  let fakeCommentsService: FakeCommentsService;
  let fakeModalCtrl: jasmine.SpyObj<ModalController>;

  beforeEach(async () => {
    // Avoids `CachedImageDirective` on the rendered `CommentTileComponent`s
    // firing a real `fetch()` for an author avatar during change detection.
    spyOn(window, 'fetch').and.rejectWith(new Error('no network in tests'));

    fakeCommentsService = new FakeCommentsService();
    fakeModalCtrl = jasmine.createSpyObj<ModalController>('ModalController', ['create']);

    await TestBed.configureTestingModule({
      imports: [CommentsSectionComponent],
      providers: [
        provideIonicAngular(),
        provideNoopAnimations(),
        provideTestTranslations(),
        { provide: CommentsService, useValue: fakeCommentsService },
        { provide: AuthService, useValue: new FakeAuthService() },
        { provide: ModalController, useValue: fakeModalCtrl },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CommentsSectionComponent);
    fixture.componentRef.setInput('postId', 'post-1');
    fixture.componentRef.setInput('postAuthorId', postAuthorId);
  });

  it('loads the post comments once on init', () => {
    fixture.detectChanges();

    expect(fakeCommentsService.loadComments).toHaveBeenCalledWith('post-1');
  });

  it('allows deleting a comment authored by the current user that is not pendingSync', () => {
    fixture.detectChanges();

    expect(fixture.componentInstance.canDelete(ownComment)).toBeTrue();
  });

  it('allows deleting any comment on a post authored by the current user', () => {
    fixture.componentRef.setInput('postAuthorId', currentUser.id);
    fixture.detectChanges();

    expect(fixture.componentInstance.canDelete(otherAuthorComment)).toBeTrue();
  });

  it('disallows deleting a comment authored by someone else on someone else\'s post', () => {
    fixture.detectChanges();

    expect(fixture.componentInstance.canDelete(otherAuthorComment)).toBeFalse();
  });

  it('disallows deleting an own comment that is still pendingSync', () => {
    fixture.detectChanges();

    expect(fixture.componentInstance.canDelete(pendingOwnComment)).toBeFalse();
  });

  it('calls CommentsService.deleteComment when a tile emits delete', () => {
    fakeCommentsService.setState({ status: 'success', postId: 'post-1', data: [ownComment], nextCursor: null });
    fixture.detectChanges();

    const tile = fixture.debugElement.query(By.css('app-comment-tile'));
    tile.triggerEventHandler('delete', undefined);

    expect(fakeCommentsService.deleteComment).toHaveBeenCalledWith(ownComment.id);
  });

  it('calls CommentsService.addComment with the entered content when the modal is dismissed non-cancel', async () => {
    fixture.detectChanges();
    const fakeModal = {
      present: jasmine.createSpy('present').and.resolveTo(undefined),
      onWillDismiss: jasmine.createSpy('onWillDismiss').and.resolveTo({ data: { content: 'Nice!' }, role: 'submit' }),
    };
    fakeModalCtrl.create.and.resolveTo(fakeModal as unknown as HTMLIonModalElement);

    await fixture.componentInstance.openCommentInput();

    expect(fakeModal.present).toHaveBeenCalled();
    expect(fakeCommentsService.addComment).toHaveBeenCalledWith('post-1', 'Nice!');
  });

  it('does not call CommentsService.addComment when the modal is dismissed with role cancel', async () => {
    fixture.detectChanges();
    const fakeModal = {
      present: jasmine.createSpy('present').and.resolveTo(undefined),
      onWillDismiss: jasmine.createSpy('onWillDismiss').and.resolveTo({ data: null, role: 'cancel' }),
    };
    fakeModalCtrl.create.and.resolveTo(fakeModal as unknown as HTMLIonModalElement);

    await fixture.componentInstance.openCommentInput();

    expect(fakeCommentsService.addComment).not.toHaveBeenCalled();
  });

  it('reloads comments when retrying after an error', () => {
    fakeCommentsService.setState({ status: 'error', error: { kind: 'server', message: 'Unexpected server error.', statusCode: 500 } });
    fixture.detectChanges();
    fakeCommentsService.loadComments.calls.reset();

    fixture.componentInstance.onRetry();

    expect(fakeCommentsService.loadComments).toHaveBeenCalledWith('post-1');
  });
});
