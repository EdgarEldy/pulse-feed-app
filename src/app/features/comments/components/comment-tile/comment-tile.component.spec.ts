import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { CommentRow } from '../../comment.model';
import { provideTestTranslations } from '../../../../testing/translate-testing';
import { CommentTileComponent } from './comment-tile.component';

const comment: CommentRow = {
  id: 'comment-1',
  postId: 'post-1',
  authorId: 'user-1',
  authorName: 'Ada Lovelace',
  authorPhotoUrl: 'https://example.com/ada.jpg',
  content: 'Nice post!',
  createdAt: '2024-01-01T00:00:00.000Z',
  pendingSync: false,
};

describe('CommentTileComponent', () => {
  let fixture: ComponentFixture<CommentTileComponent>;

  beforeEach(async () => {
    // Avoids `CachedImageDirective` firing a real `fetch()` for the
    // author avatar the moment change detection runs.
    spyOn(window, 'fetch').and.rejectWith(new Error('no network in tests'));

    await TestBed.configureTestingModule({
      imports: [CommentTileComponent],
      providers: [provideIonicAngular(), provideTestTranslations()],
    }).compileComponents();

    fixture = TestBed.createComponent(CommentTileComponent);
    fixture.componentRef.setInput('comment', comment);
  });

  it('shows the delete action when canDelete is true and the comment is not pendingSync', () => {
    fixture.componentRef.setInput('canDelete', true);
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.comment-tile__delete'))).not.toBeNull();
    expect(fixture.debugElement.query(By.css('.comment-tile__pending'))).toBeNull();
  });

  it('hides the delete action when canDelete is false', () => {
    fixture.componentRef.setInput('canDelete', false);
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.comment-tile__delete'))).toBeNull();
  });

  it('hides the delete action and shows a pending indicator for a comment still pendingSync, even if canDelete is true', () => {
    fixture.componentRef.setInput('comment', { ...comment, pendingSync: true });
    fixture.componentRef.setInput('canDelete', true);
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.comment-tile__delete'))).toBeNull();
    expect(fixture.debugElement.query(By.css('.comment-tile__pending'))).not.toBeNull();
  });

  it('emits delete when the delete button is clicked', () => {
    fixture.componentRef.setInput('canDelete', true);
    fixture.detectChanges();

    const deleteSpy = jasmine.createSpy('delete');
    fixture.componentInstance.delete.subscribe(deleteSpy);

    fixture.debugElement.query(By.css('.comment-tile__delete')).triggerEventHandler('click', new MouseEvent('click'));

    expect(deleteSpy).toHaveBeenCalled();
  });
});
