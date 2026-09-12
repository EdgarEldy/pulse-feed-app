import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { CameraWeb } from '@capacitor/camera/dist/esm/web';
import { Subject, of, throwError } from 'rxjs';
import { UploadEvent } from '../../../core/http/base-api.service';
import { UsersService } from '../../../features/users/users.service';
import { provideTestTranslations } from '../../../testing/translate-testing';
import { AvatarPickerComponent } from './avatar-picker.component';

/**
 * `pickAndUpload()` resolves through several chained Promises (the
 * Capacitor plugin proxy's own lazy web-implementation loading, `fetch`,
 * `Blob`) before it ever subscribes to `UsersService.uploadAvatar`.
 * `fixture.whenStable()` is not a reliable way to wait for that chain: it
 * resolves once `NgZone` next reports stable, which can happen before a
 * pure microtask chain like this one has fully drained. Waiting on a
 * `setTimeout` macrotask instead guarantees the whole microtask queue has
 * emptied first, the same technique `auth.service.spec.ts` uses.
 */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('AvatarPickerComponent', () => {
  let fixture: ComponentFixture<AvatarPickerComponent>;
  let component: AvatarPickerComponent;
  let fakeUsersService: jasmine.SpyObj<UsersService>;

  beforeEach(async () => {
    fakeUsersService = jasmine.createSpyObj<UsersService>('UsersService', ['uploadAvatar']);

    // The real `fetch`/`Response.blob()` pipeline reads its body through a
    // stream, which in a headless browser can take more than one
    // microtask/macrotask turn to settle. Returning a plain object whose
    // `blob()` resolves a synchronously-constructed `Blob` keeps this test
    // fast and deterministic without depending on how many event-loop
    // turns the real implementation happens to need.
    spyOn(window, 'fetch').and.resolveTo({
      blob: () => Promise.resolve(new Blob(['bytes'], { type: 'image/jpeg' })),
    } as Response);

    await TestBed.configureTestingModule({
      imports: [AvatarPickerComponent],
      providers: [
        provideIonicAngular(),
        provideTestTranslations(),
        { provide: UsersService, useValue: fakeUsersService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AvatarPickerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('uploads the picked photo and emits the server response on success', async () => {
    spyOn(CameraWeb.prototype, 'getPhoto').and.resolveTo({ webPath: 'blob:fake-path', format: 'jpeg' } as never);
    const upload$ = of<UploadEvent<{ photoUrl: string }>>({ progress: 100, result: { photoUrl: 'https://example.com/avatar.jpg' } });
    fakeUsersService.uploadAvatar.and.returnValue(upload$);

    let emitted: { photoUrl: string } | undefined;
    component.uploaded.subscribe((event) => (emitted = event));

    const button = fixture.debugElement.query(By.css('ion-button'));
    button.triggerEventHandler('click', null);
    await flushMicrotasks();

    expect(fakeUsersService.uploadAvatar).toHaveBeenCalled();
    expect(emitted).toEqual({ photoUrl: 'https://example.com/avatar.jpg' });
    expect(component.state()).toEqual({ status: 'idle' });
  });

  it('sets an error state when the upload fails', async () => {
    spyOn(CameraWeb.prototype, 'getPhoto').and.resolveTo({ webPath: 'blob:fake-path', format: 'jpeg' } as never);
    fakeUsersService.uploadAvatar.and.returnValue(throwError(() => ({ kind: 'network', message: 'No connection to the server.' })));

    const button = fixture.debugElement.query(By.css('ion-button'));
    button.triggerEventHandler('click', null);
    await flushMicrotasks();

    expect(component.state()).toEqual({ status: 'error', error: { kind: 'network', message: 'No connection to the server.' } });
  });

  it('stays idle when the user backs out of the native picker', async () => {
    spyOn(CameraWeb.prototype, 'getPhoto').and.rejectWith(new Error('User cancelled photos app'));

    const button = fixture.debugElement.query(By.css('ion-button'));
    button.triggerEventHandler('click', null);
    await flushMicrotasks();

    expect(fakeUsersService.uploadAvatar).not.toHaveBeenCalled();
    expect(component.state()).toEqual({ status: 'idle' });
  });

  it('reports intermediate progress events before the final result', async () => {
    spyOn(CameraWeb.prototype, 'getPhoto').and.resolveTo({ webPath: 'blob:fake-path', format: 'jpeg' } as never);
    const progress$ = new Subject<UploadEvent<{ photoUrl: string }>>();
    fakeUsersService.uploadAvatar.and.returnValue(progress$.asObservable());

    const button = fixture.debugElement.query(By.css('ion-button'));
    button.triggerEventHandler('click', null);
    await flushMicrotasks();

    progress$.next({ progress: 42 });

    expect(component.state()).toEqual({ status: 'uploading', progress: 42 });
  });
});
