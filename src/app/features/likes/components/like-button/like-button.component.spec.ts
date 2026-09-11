import { NO_ERRORS_SCHEMA, Signal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { LikeState, LikesService } from '../../likes.service';
import { LikeButtonComponent } from './like-button.component';

class FakeLikesService {
  private readonly statesMap = signal(new Map<string, LikeState>());
  readonly states: Signal<Map<string, LikeState>> = this.statesMap.asReadonly();

  readonly toggle = jasmine.createSpy('toggle');

  initPost(postId: string, likesCount: number, isLiked: boolean): void {
    this.statesMap.update((map) => {
      if (map.has(postId)) {
        return map;
      }
      const next = new Map(map);
      next.set(postId, { isLiked, likesCount });
      return next;
    });
  }

  seedState(postId: string, state: LikeState): void {
    this.statesMap.update((map) => {
      const next = new Map(map);
      next.set(postId, state);
      return next;
    });
  }
}

describe('LikeButtonComponent', () => {
  let component: LikeButtonComponent;
  let fixture: ComponentFixture<LikeButtonComponent>;
  let fakeLikesService: FakeLikesService;

  beforeEach(async () => {
    fakeLikesService = new FakeLikesService();

    await TestBed.configureTestingModule({
      imports: [LikeButtonComponent],
      providers: [
        provideIonicAngular(),
        provideNoopAnimations(),
        { provide: LikesService, useValue: fakeLikesService },
      ],
    })
      .overrideComponent(LikeButtonComponent, { set: { schemas: [NO_ERRORS_SCHEMA] } })
      .compileComponents();

    fixture = TestBed.createComponent(LikeButtonComponent);
    component = fixture.componentInstance;
  });

  it('should create with the required postId input', () => {
    fixture.componentRef.setInput('postId', 'post-1');
    fixture.detectChanges();

    expect(component).toBeTruthy();
  });

  describe('button tap', () => {
    it('calls toggle with the postId when the button is clicked', () => {
      fixture.componentRef.setInput('postId', 'post-1');
      fixture.componentRef.setInput('initialLikesCount', 3);
      fixture.componentRef.setInput('initialIsLiked', false);
      fixture.detectChanges();

      const button = fixture.debugElement.query(By.css('ion-button'));
      button.nativeElement.click();

      expect(fakeLikesService.toggle).toHaveBeenCalledWith('post-1');
    });

    it('stops event propagation so parent elements do not receive the click', () => {
      fixture.componentRef.setInput('postId', 'post-1');
      fixture.componentRef.setInput('initialLikesCount', 0);
      fixture.componentRef.setInput('initialIsLiked', false);
      fixture.detectChanges();

      const mockEvent = jasmine.createSpyObj<Event>('Event', ['stopPropagation']);
      component.onTap(mockEvent);

      expect(mockEvent.stopPropagation).toHaveBeenCalled();
    });
  });

  describe('icon rendering', () => {
    it('shows the filled heart icon when isLiked is true', () => {
      fakeLikesService.seedState('post-1', { isLiked: true, likesCount: 4 });

      fixture.componentRef.setInput('postId', 'post-1');
      fixture.componentRef.setInput('initialLikesCount', 0);
      fixture.componentRef.setInput('initialIsLiked', false);
      fixture.detectChanges();

      const icon = fixture.debugElement.query(By.css('ion-icon'));
      expect(icon.properties['name']).toBe('heart');
    });

    it('shows the heart-outline icon when isLiked is false', () => {
      fakeLikesService.seedState('post-1', { isLiked: false, likesCount: 3 });

      fixture.componentRef.setInput('postId', 'post-1');
      fixture.componentRef.setInput('initialLikesCount', 3);
      fixture.componentRef.setInput('initialIsLiked', false);
      fixture.detectChanges();

      const icon = fixture.debugElement.query(By.css('ion-icon'));
      expect(icon.properties['name']).toBe('heart-outline');
    });

    it('falls back to initialIsLiked for the icon when no state has been seeded yet', () => {
      fixture.componentRef.setInput('postId', 'post-without-state');
      fixture.componentRef.setInput('initialLikesCount', 2);
      fixture.componentRef.setInput('initialIsLiked', true);
      fixture.detectChanges();

      // likeState() returns undefined, so it falls back to initialIsLiked() = true
      const icon = fixture.debugElement.query(By.css('ion-icon'));
      expect(icon.properties['name']).toBe('heart');
    });
  });

  describe('count display', () => {
    it('displays the likesCount from service state', () => {
      fakeLikesService.seedState('post-1', { isLiked: false, likesCount: 42 });

      fixture.componentRef.setInput('postId', 'post-1');
      fixture.componentRef.setInput('initialLikesCount', 0);
      fixture.componentRef.setInput('initialIsLiked', false);
      fixture.detectChanges();

      const span = fixture.debugElement.query(By.css('span'));
      expect(span.nativeElement.textContent.trim()).toBe('42');
    });

    it('falls back to initialLikesCount when no state has been seeded', () => {
      fixture.componentRef.setInput('postId', 'post-without-state');
      fixture.componentRef.setInput('initialLikesCount', 7);
      fixture.componentRef.setInput('initialIsLiked', false);
      fixture.detectChanges();

      const span = fixture.debugElement.query(By.css('span'));
      expect(span.nativeElement.textContent.trim()).toBe('7');
    });
  });
});
