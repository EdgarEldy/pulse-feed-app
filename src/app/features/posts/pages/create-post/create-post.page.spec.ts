import { Signal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { CameraWeb } from '@capacitor/camera/dist/esm/web';
import { provideTestTranslations } from '../../../../testing/translate-testing';
import { PostRow } from '../../post.model';
import { PostsState, PostsService } from '../../posts.service';
import { CreatePostPage } from './create-post.page';

const existingPost: PostRow = {
  id: 'post-1',
  authorId: 'user-1',
  authorName: 'Ada Lovelace',
  authorPhotoUrl: 'https://example.com/ada.jpg',
  title: 'Already there',
  content: 'Existing content',
  createdAt: '2024-01-01T00:00:00.000Z',
  commentsCount: 0,
  likesCount: 0,
  isLikedByMe: false,
  pendingSync: false,
};

class FakePostsService {
  private readonly postsSignal = signal<PostsState>({ status: 'idle' });
  readonly posts: Signal<PostsState> = this.postsSignal.asReadonly();

  private readonly progressSignal = signal<number | null>(null);
  readonly createProgress: Signal<number | null> = this.progressSignal.asReadonly();

  readonly createPost = jasmine.createSpy('createPost');

  setPosts(state: PostsState): void {
    this.postsSignal.set(state);
  }

  setProgress(value: number | null): void {
    this.progressSignal.set(value);
  }
}

describe('CreatePostPage', () => {
  let fixture: ComponentFixture<CreatePostPage>;
  let component: CreatePostPage;
  let fakePostsService: FakePostsService;
  let router: Router;

  beforeEach(async () => {
    fakePostsService = new FakePostsService();

    await TestBed.configureTestingModule({
      imports: [CreatePostPage],
      providers: [
        provideIonicAngular(),
        provideRouter([]),
        provideTestTranslations(),
        { provide: PostsService, useValue: fakePostsService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CreatePostPage);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    spyOn(router, 'navigateByUrl').and.resolveTo(true);
    fixture.detectChanges();
  });

  describe('form validation', () => {
    it('marks both fields touched and does not submit when the form is empty', () => {
      component.onSubmit();

      expect(component.titleControl.touched).toBeTrue();
      expect(component.contentControl.touched).toBeTrue();
      expect(fakePostsService.createPost).not.toHaveBeenCalled();
    });

    it('shows the required error for an untouched-but-submitted empty title', () => {
      component.onSubmit();
      fixture.detectChanges();

      const errors = fixture.debugElement.queryAll(By.css('.field-error'));
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('onSubmit', () => {
    it('calls PostsService.createPost with the entered title, content, and no image', () => {
      component.titleControl.setValue('Hello world');
      component.contentControl.setValue('My first post');

      component.onSubmit();

      expect(fakePostsService.createPost).toHaveBeenCalledWith({
        title: 'Hello world',
        content: 'My first post',
        imageUri: undefined,
      });
    });

    it('includes the picked image uri when one has been picked', () => {
      component.titleControl.setValue('Hello world');
      component.contentControl.setValue('My first post');
      component.pickedImageUri.set('blob:fake-path');

      component.onSubmit();

      expect(fakePostsService.createPost).toHaveBeenCalledWith({
        title: 'Hello world',
        content: 'My first post',
        imageUri: 'blob:fake-path',
      });
    });

    it('navigates to the feed once a new post appears at the front of posts() after submitting', () => {
      fakePostsService.setPosts({ status: 'success', data: [existingPost], nextCursor: null });
      fixture.detectChanges();

      component.titleControl.setValue('Hello world');
      component.contentControl.setValue('My first post');
      component.onSubmit();

      const createdPost: PostRow = { ...existingPost, id: 'post-2', title: 'Hello world', content: 'My first post' };
      fakePostsService.setPosts({ status: 'success', data: [createdPost, existingPost], nextCursor: null });
      TestBed.tick();

      expect(router.navigateByUrl).toHaveBeenCalledWith('/feed');
    });

    it('does not navigate when posts() is already success with the same first post as before submitting', () => {
      fakePostsService.setPosts({ status: 'success', data: [existingPost], nextCursor: null });
      fixture.detectChanges();

      component.titleControl.setValue('Hello world');
      component.contentControl.setValue('My first post');
      component.onSubmit();

      // An unrelated background refresh completes while the create is still
      // in flight, leaving the same first post in place: this must not be
      // mistaken for the create itself having succeeded.
      fakePostsService.setPosts({ status: 'success', data: [existingPost], nextCursor: null });
      TestBed.tick();

      expect(router.navigateByUrl).not.toHaveBeenCalled();
    });

    it('shows an error toast and stays on the page when creation fails with a non-network error', () => {
      component.titleControl.setValue('Hello world');
      component.contentControl.setValue('My first post');
      component.onSubmit();

      fakePostsService.setPosts({ status: 'error', error: { kind: 'server', message: 'Unexpected server error.', statusCode: 500 } });
      TestBed.tick();

      expect(component.toastOpen()).toBeTrue();
      expect(component.toastMessage()).toBe('Unexpected server error.');
      expect(router.navigateByUrl).not.toHaveBeenCalled();
    });

    it('does not show an error toast when creation fails with a network error, since the write is queued instead', () => {
      component.titleControl.setValue('Hello world');
      component.contentControl.setValue('My first post');
      component.onSubmit();

      fakePostsService.setPosts({ status: 'error', error: { kind: 'network', message: "You're offline. Check your connection and try again." } });
      TestBed.tick();

      expect(component.toastOpen()).toBeFalse();
      expect(router.navigateByUrl).not.toHaveBeenCalled();
    });
  });

  describe('image picking', () => {
    it('sets pickedImageUri from the photo webPath', async () => {
      spyOn(CameraWeb.prototype, 'getPhoto').and.resolveTo({ webPath: 'blob:fake-path', format: 'jpeg' } as never);

      await component.pickImage();

      expect(component.pickedImageUri()).toBe('blob:fake-path');
    });

    it('shows an error toast when the picked photo has no webPath', async () => {
      spyOn(CameraWeb.prototype, 'getPhoto').and.resolveTo({ format: 'jpeg' } as never);

      await component.pickImage();

      expect(component.pickedImageUri()).toBeNull();
      expect(component.toastOpen()).toBeTrue();
    });

    it('leaves pickedImageUri unset when the user backs out of the native picker', async () => {
      spyOn(CameraWeb.prototype, 'getPhoto').and.rejectWith(new Error('User cancelled photos app'));

      await component.pickImage();

      expect(component.pickedImageUri()).toBeNull();
      expect(component.toastOpen()).toBeFalse();
    });

    it('removeImage clears a previously picked image', () => {
      component.pickedImageUri.set('blob:fake-path');

      component.removeImage();

      expect(component.pickedImageUri()).toBeNull();
    });
  });

  describe('upload progress', () => {
    it('reports isUploading true while a create is in flight', () => {
      fakePostsService.setProgress(42);
      fixture.detectChanges();

      expect(component.isUploading()).toBeTrue();
      expect(component.canSubmit()).toBeFalse();
    });

    it('reports isUploading false once no create is in flight', () => {
      fakePostsService.setProgress(null);
      fixture.detectChanges();

      expect(component.isUploading()).toBeFalse();
      expect(component.canSubmit()).toBeTrue();
    });
  });
});
