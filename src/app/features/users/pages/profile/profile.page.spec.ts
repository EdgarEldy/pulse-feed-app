import { Signal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { AppError } from '../../../../core/models/app-error';
import { provideTestTranslations } from '../../../../testing/translate-testing';
import { User } from '../../user.model';
import { UsersService, UsersState } from '../../users.service';
import { ProfilePage } from './profile.page';

const sampleUser: User = {
  id: 'user-1',
  displayName: 'Ada Lovelace',
  email: 'ada@example.com',
  photoUrl: 'https://example.com/ada.jpg',
  createdAt: '2024-01-01T00:00:00.000Z',
};

class FakeUsersService {
  private readonly userSignal = signal<UsersState>({ status: 'idle' });
  readonly user: Signal<UsersState> = this.userSignal.asReadonly();
  readonly loadUser = jasmine.createSpy('loadUser').and.callFake(() => {
    this.userSignal.set({ status: 'loading' });
  });

  setState(state: UsersState): void {
    this.userSignal.set(state);
  }
}

describe('ProfilePage', () => {
  let fixture: ComponentFixture<ProfilePage>;
  let fakeUsersService: FakeUsersService;

  beforeEach(async () => {
    fakeUsersService = new FakeUsersService();

    await TestBed.configureTestingModule({
      imports: [ProfilePage],
      providers: [
        provideIonicAngular(),
        provideTestTranslations(),
        { provide: UsersService, useValue: fakeUsersService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProfilePage);
    fixture.componentRef.setInput('id', 'user-1');
  });

  it('shows a loading state then the user\'s data', () => {
    fixture.detectChanges();

    expect(fakeUsersService.loadUser).toHaveBeenCalledWith('user-1');
    expect(fixture.debugElement.query(By.css('app-loading-indicator'))).not.toBeNull();
    expect(fixture.debugElement.query(By.css('.profile'))).toBeNull();

    fakeUsersService.setState({ status: 'success', data: sampleUser });
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('app-loading-indicator'))).toBeNull();
    const nameEl = fixture.debugElement.query(By.css('.profile__name'));
    expect(nameEl.nativeElement.textContent).toContain('Ada Lovelace');
  });

  it('renders an ErrorViewComponent when the user fails to load', () => {
    fixture.detectChanges();

    const error: AppError = { kind: 'network', message: 'No connection to the server.' };
    fakeUsersService.setState({ status: 'error', error });
    fixture.detectChanges();

    const errorView = fixture.debugElement.query(By.css('app-error-view'));
    expect(errorView).not.toBeNull();
    expect(errorView.componentInstance.error).toEqual(error);
  });

  it('retries loadUser when the error view emits retry', () => {
    fixture.detectChanges();

    const error: AppError = { kind: 'server', message: 'Unexpected server error.', statusCode: 500 };
    fakeUsersService.setState({ status: 'error', error });
    fixture.detectChanges();

    fakeUsersService.loadUser.calls.reset();
    const errorView = fixture.debugElement.query(By.css('app-error-view'));
    errorView.triggerEventHandler('retry', undefined);

    expect(fakeUsersService.loadUser).toHaveBeenCalledWith('user-1');
  });
});
