import { Signal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { ConnectivityService } from '../../../../core/network/connectivity.service';
import { AuthService } from '../../../auth/auth.service';
import { User } from '../../user.model';
import { UsersService, UsersState } from '../../users.service';
import { EditProfilePage } from './edit-profile.page';

const sampleUser: User = {
  id: 'user-1',
  displayName: 'Ada Lovelace',
  email: 'ada@example.com',
  photoUrl: 'https://example.com/ada.jpg',
  createdAt: '2024-01-01T00:00:00.000Z',
};

class FakeAuthService {
  private readonly currentUserSignal = signal<User | null>(sampleUser);
  readonly currentUser: Signal<User | null> = this.currentUserSignal.asReadonly();
  readonly updateCurrentUser = jasmine.createSpy('updateCurrentUser').and.resolveTo(undefined);
}

class FakeUsersService {
  private readonly updateStateSignal = signal<UsersState>({ status: 'idle' });
  readonly profileUpdate: Signal<UsersState> = this.updateStateSignal.asReadonly();
  readonly updateProfile = jasmine.createSpy('updateProfile');
  readonly loadUser = jasmine.createSpy('loadUser');
  readonly uploadAvatar = jasmine.createSpy('uploadAvatar');

  setUpdateState(state: UsersState): void {
    this.updateStateSignal.set(state);
  }
}

class FakeConnectivityService {
  private readonly onlineSignal = signal(true);
  readonly isOnline: Signal<boolean> = this.onlineSignal.asReadonly();

  setOnline(value: boolean): void {
    this.onlineSignal.set(value);
  }
}

describe('EditProfilePage', () => {
  let fixture: ComponentFixture<EditProfilePage>;
  let component: EditProfilePage;
  let fakeAuthService: FakeAuthService;
  let fakeUsersService: FakeUsersService;
  let fakeConnectivityService: FakeConnectivityService;

  beforeEach(async () => {
    fakeAuthService = new FakeAuthService();
    fakeUsersService = new FakeUsersService();
    fakeConnectivityService = new FakeConnectivityService();

    await TestBed.configureTestingModule({
      imports: [EditProfilePage],
      providers: [
        provideIonicAngular(),
        { provide: AuthService, useValue: fakeAuthService },
        { provide: UsersService, useValue: fakeUsersService },
        { provide: ConnectivityService, useValue: fakeConnectivityService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EditProfilePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('pre-fills the display name field from AuthService.currentUser', () => {
    expect(component.form.controls.displayName.value).toBe('Ada Lovelace');
  });

  it('disables the submit button while offline', () => {
    fakeConnectivityService.setOnline(false);
    fixture.detectChanges();

    const submitButton = fixture.debugElement.query(By.css('ion-button[type="submit"]'));
    expect(submitButton.properties['disabled']).toBeTrue();
    expect(component.canSubmit()).toBeFalse();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain("You're offline");
  });

  it('enables the submit button while online and not submitting', () => {
    expect(component.canSubmit()).toBeTrue();
  });

  it('calls updateProfile with the form value on submit', () => {
    component.form.setValue({ displayName: 'Ada L.' });
    const form = fixture.debugElement.query(By.css('form'));
    form.triggerEventHandler('ngSubmit', null);

    expect(fakeUsersService.updateProfile).toHaveBeenCalledWith('Ada L.');
  });

  it('shows a success toast and syncs AuthService.currentUser when profileUpdate succeeds', () => {
    component.form.setValue({ displayName: 'Ada L.' });
    const form = fixture.debugElement.query(By.css('form'));
    form.triggerEventHandler('ngSubmit', null);

    const updated: User = { ...sampleUser, displayName: 'Ada L.' };
    fakeUsersService.setUpdateState({ status: 'success', data: updated });
    TestBed.tick();
    fixture.detectChanges();

    expect(component.toastOpen()).toBeTrue();
    expect(component.toastMessage()).toBe('Profile updated.');
    expect(fakeAuthService.updateCurrentUser).toHaveBeenCalledWith(updated);
  });

  it('does not show a toast for a profileUpdate state left over before this page ever submitted', () => {
    fakeUsersService.setUpdateState({ status: 'success', data: sampleUser });
    TestBed.tick();
    fixture.detectChanges();

    expect(component.toastOpen()).toBeFalse();
  });

  it('shows an error toast when profileUpdate fails', () => {
    component.form.setValue({ displayName: 'Ada L.' });
    const form = fixture.debugElement.query(By.css('form'));
    form.triggerEventHandler('ngSubmit', null);

    fakeUsersService.setUpdateState({ status: 'error', error: { kind: 'server', message: 'Unexpected server error.', statusCode: 500 } });
    TestBed.tick();
    fixture.detectChanges();

    expect(component.toastOpen()).toBeTrue();
    expect(component.toastMessage()).toBe('Unexpected server error.');
  });
});
