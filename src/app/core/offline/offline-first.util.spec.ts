import { of, throwError } from 'rxjs';
import { AppError } from '../models/app-error';
import { loadOfflineFirst } from './offline-first.util';

interface Page {
  items: string[];
}

describe('loadOfflineFirst', () => {
  it('writes through to the cache and emits success when remote succeeds', (done) => {
    const remoteData: Page = { items: ['a', 'b'] };
    const cacheWrite = jasmine.createSpy('cacheWrite').and.returnValue(Promise.resolve());
    const cacheRead = jasmine.createSpy('cacheRead');

    loadOfflineFirst<Page>({
      remote: () => of(remoteData),
      cacheRead,
      cacheWrite,
    }).subscribe((result) => {
      expect(result).toEqual({ status: 'success', data: remoteData });
      expect(cacheWrite).toHaveBeenCalledWith(remoteData);
      expect(cacheRead).not.toHaveBeenCalled();
      done();
    });
  });

  it('falls back to cacheRead and emits its result as success when remote fails with a network AppError', (done) => {
    const networkError: AppError = { kind: 'network', message: 'No connection to the server.' };
    const cachedData: Page = { items: ['cached'] };
    const cacheWrite = jasmine.createSpy('cacheWrite');

    loadOfflineFirst<Page>({
      remote: () => throwError(() => networkError),
      cacheRead: () => Promise.resolve(cachedData),
      cacheWrite,
    }).subscribe((result) => {
      expect(result).toEqual({ status: 'success', data: cachedData });
      expect(cacheWrite).not.toHaveBeenCalled();
      done();
    });
  });

  it('propagates a non-network AppError untouched without ever calling cacheRead', (done) => {
    const unauthorizedError: AppError = { kind: 'unauthorized', message: 'Session expired.' };
    const cacheRead = jasmine.createSpy('cacheRead');

    loadOfflineFirst<Page>({
      remote: () => throwError(() => unauthorizedError),
      cacheRead,
      cacheWrite: () => {},
    }).subscribe((result) => {
      expect(result).toEqual({ status: 'error', error: unauthorizedError });
      expect(cacheRead).not.toHaveBeenCalled();
      done();
    });
  });

  it('emits a cache AppError when remote fails with network and cacheRead itself rejects', (done) => {
    const networkError: AppError = { kind: 'network', message: 'No connection to the server.' };

    loadOfflineFirst<Page>({
      remote: () => throwError(() => networkError),
      cacheRead: () => Promise.reject(new Error('local database is not open')),
      cacheWrite: () => {},
    }).subscribe((result) => {
      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.error.kind).toBe('cache');
      }
      done();
    });
  });
});
