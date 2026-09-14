import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { AppError } from '../../core/models/app-error';
import { User } from './user.model';
import { UsersApiService } from './users-api.service';
import { UsersService } from './users.service';

const sampleUser: User = {
  id: 'user-1',
  displayName: 'Ada Lovelace',
  email: 'ada@example.com',
  photoUrl: 'https://example.com/ada.jpg',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const otherUser: User = {
  id: 'user-2',
  displayName: 'Grace Hopper',
  email: 'grace@example.com',
  photoUrl: '',
  createdAt: '2024-01-02T00:00:00.000Z',
};

describe('UsersService', () => {
  let service: UsersService;
  let fakeApi: jasmine.SpyObj<UsersApiService>;

  beforeEach(() => {
    fakeApi = jasmine.createSpyObj<UsersApiService>('UsersApiService', ['getUser', 'updateProfile', 'uploadAvatar']);

    TestBed.configureTestingModule({
      providers: [{ provide: UsersApiService, useValue: fakeApi }],
    });

    service = TestBed.inject(UsersService);
  });

  describe('loadUser', () => {
    it('reports a loading state while the request is in flight, then success once it resolves', () => {
      const subject = new Subject<User>();
      fakeApi.getUser.and.returnValue(subject.asObservable());

      service.loadUser('user-1');

      expect(fakeApi.getUser).toHaveBeenCalledWith('user-1');
      expect(service.user()).toEqual({ status: 'loading' });

      subject.next(sampleUser);
      subject.complete();

      expect(service.user()).toEqual({ status: 'success', data: sampleUser });
    });

    it('sets an error state when the API call fails', () => {
      const error: AppError = { kind: 'network', message: 'No connection to the server.' };
      fakeApi.getUser.and.returnValue(throwError(() => error));

      service.loadUser('user-1');

      expect(service.user()).toEqual({ status: 'error', error });
    });
  });

  describe('updateProfile', () => {
    it('calls the API service with the correct payload', () => {
      fakeApi.updateProfile.and.returnValue(of(sampleUser));

      service.updateProfile('Ada L.');

      expect(fakeApi.updateProfile).toHaveBeenCalledWith('Ada L.');
    });

    it('refreshes the loaded user signal in place when its id matches the updated user', () => {
      fakeApi.getUser.and.returnValue(of(sampleUser));
      service.loadUser('user-1');
      expect(service.user()).toEqual({ status: 'success', data: sampleUser });

      const updated: User = { ...sampleUser, displayName: 'Ada L.' };
      fakeApi.updateProfile.and.returnValue(of(updated));

      service.updateProfile('Ada L.');

      expect(service.profileUpdate()).toEqual({ status: 'success', data: updated });
      expect(service.user()).toEqual({ status: 'success', data: updated });
    });

    it('leaves the loaded user signal alone when it is showing a different account', () => {
      fakeApi.getUser.and.returnValue(of(otherUser));
      service.loadUser('user-2');
      expect(service.user()).toEqual({ status: 'success', data: otherUser });

      fakeApi.updateProfile.and.returnValue(of(sampleUser));

      service.updateProfile('Ada L.');

      expect(service.profileUpdate()).toEqual({ status: 'success', data: sampleUser });
      expect(service.user()).toEqual({ status: 'success', data: otherUser });
    });

    it('sets an error state on profileUpdate when the API call fails, without touching user', () => {
      fakeApi.getUser.and.returnValue(of(sampleUser));
      service.loadUser('user-1');

      const error: AppError = { kind: 'server', message: 'Unexpected server error.', statusCode: 500 };
      fakeApi.updateProfile.and.returnValue(throwError(() => error));

      service.updateProfile('Ada L.');

      expect(service.profileUpdate()).toEqual({ status: 'error', error });
      expect(service.user()).toEqual({ status: 'success', data: sampleUser });
    });
  });

  describe('uploadAvatar', () => {
    it('delegates directly to the API service and returns its observable', () => {
      const upload$ = of({ progress: 100, result: { photoUrl: 'https://example.com/new.jpg' } });
      fakeApi.uploadAvatar.and.returnValue(upload$);
      const file = new File(['bytes'], 'avatar.jpg', { type: 'image/jpeg' });

      const result$ = service.uploadAvatar(file);

      expect(fakeApi.uploadAvatar).toHaveBeenCalledWith(file);
      expect(result$).toBe(upload$);
    });
  });
});
