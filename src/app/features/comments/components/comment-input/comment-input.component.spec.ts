import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideIonicAngular, ModalController } from '@ionic/angular/standalone';
import { CommentInputComponent } from './comment-input.component';

describe('CommentInputComponent', () => {
  let fixture: ComponentFixture<CommentInputComponent>;
  let component: CommentInputComponent;
  let fakeModal: jasmine.SpyObj<ModalController>;

  beforeEach(async () => {
    fakeModal = jasmine.createSpyObj<ModalController>('ModalController', ['dismiss']);
    fakeModal.dismiss.and.resolveTo(true);

    await TestBed.configureTestingModule({
      imports: [CommentInputComponent],
      providers: [
        provideIonicAngular(),
        provideNoopAnimations(),
        { provide: ModalController, useValue: fakeModal },
      ],
    })
      .overrideComponent(CommentInputComponent, { set: { schemas: [NO_ERRORS_SCHEMA] } })
      .compileComponents();

    fixture = TestBed.createComponent(CommentInputComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  describe('onSubmit', () => {
    it('dismisses the modal with the trimmed content and role submit, then clears the field', async () => {
      component.content.setValue('  Hello, world!  ');

      await component.onSubmit();

      expect(fakeModal.dismiss).toHaveBeenCalledWith({ content: 'Hello, world!' }, 'submit');
      expect(component.content.value).toBe('');
    });

    it('does not dismiss the modal when the field contains only whitespace', async () => {
      component.content.setValue('   ');

      await component.onSubmit();

      expect(fakeModal.dismiss).not.toHaveBeenCalled();
    });

    it('does not dismiss the modal when the field is empty', async () => {
      component.content.setValue('');

      await component.onSubmit();

      expect(fakeModal.dismiss).not.toHaveBeenCalled();
    });
  });

  describe('onClose', () => {
    it('dismisses the modal with null and role cancel', async () => {
      await component.onClose();

      expect(fakeModal.dismiss).toHaveBeenCalledWith(null, 'cancel');
    });
  });
});
