import { Signal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { LikeState, LikesService } from '../../../features/likes/likes.service';
import { PostRow } from '../../../features/posts/post.model';
import { provideTestTranslations } from '../../../testing/translate-testing';
import { PostCardComponent } from './post-card.component';

const post: PostRow = {
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
  pendingSync: false,
};

describe('PostCardComponent', () => {
  let fixture: ComponentFixture<PostCardComponent>;

  beforeEach(async () => {
    // Avoids `CachedImageDirective` firing a real `fetch()` for the
    // author avatar/post image the moment change detection runs.
    spyOn(window, 'fetch').and.rejectWith(new Error('no network in tests'));

    const fakeLikesService = jasmine.createSpyObj<LikesService>('LikesService', ['initPost', 'toggle', 'getStatus']);
    (fakeLikesService as unknown as { states: Signal<Map<string, LikeState>> }).states = signal(new Map<string, LikeState>());

    await TestBed.configureTestingModule({
      imports: [PostCardComponent],
      providers: [
        provideIonicAngular(),
        provideNoopAnimations(),
        provideTestTranslations(),
        { provide: LikesService, useValue: fakeLikesService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PostCardComponent);
    fixture.componentRef.setInput('post', post);
  });

  it('shows edit/delete actions for an own post that is not pendingSync', () => {
    fixture.componentRef.setInput('isOwnPost', true);
    fixture.detectChanges();

    expect(fixture.componentInstance.canManage()).toBeTrue();
    expect(fixture.debugElement.query(By.css('[aria-label="Edit post"]'))).not.toBeNull();
    expect(fixture.debugElement.query(By.css('[aria-label="Delete post"]'))).not.toBeNull();
    expect(fixture.debugElement.query(By.css('.post-card__pending'))).toBeNull();
  });

  it('hides edit/delete actions for a post authored by someone else', () => {
    fixture.componentRef.setInput('isOwnPost', false);
    fixture.detectChanges();

    expect(fixture.componentInstance.canManage()).toBeFalse();
    expect(fixture.debugElement.query(By.css('[aria-label="Edit post"]'))).toBeNull();
    expect(fixture.debugElement.query(By.css('[aria-label="Delete post"]'))).toBeNull();
  });

  it('hides edit/delete actions and shows a pending indicator for an own post still pendingSync', () => {
    fixture.componentRef.setInput('post', { ...post, pendingSync: true });
    fixture.componentRef.setInput('isOwnPost', true);
    fixture.detectChanges();

    expect(fixture.componentInstance.canManage()).toBeFalse();
    expect(fixture.debugElement.query(By.css('[aria-label="Delete post"]'))).toBeNull();
    expect(fixture.debugElement.query(By.css('.post-card__pending'))).not.toBeNull();
  });

  it('emits edit when the edit button is clicked', () => {
    fixture.componentRef.setInput('isOwnPost', true);
    fixture.detectChanges();

    const editSpy = jasmine.createSpy('edit');
    fixture.componentInstance.edit.subscribe(editSpy);

    fixture.debugElement.query(By.css('[aria-label="Edit post"]')).triggerEventHandler('click', new MouseEvent('click'));

    expect(editSpy).toHaveBeenCalled();
  });

  it('emits delete when the delete button is clicked', () => {
    fixture.componentRef.setInput('isOwnPost', true);
    fixture.detectChanges();

    const deleteSpy = jasmine.createSpy('delete');
    fixture.componentInstance.delete.subscribe(deleteSpy);

    fixture.debugElement.query(By.css('[aria-label="Delete post"]')).triggerEventHandler('click', new MouseEvent('click'));

    expect(deleteSpy).toHaveBeenCalled();
  });
});
