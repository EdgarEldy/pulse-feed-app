import { HttpErrorResponse } from '@angular/common/http';
import { toAppError } from './http-error.util';

describe('toAppError', () => {
  it('returns a network AppError when the status is 0, translating errors.network', () => {
    const error = new HttpErrorResponse({ status: 0 });
    const translate = jasmine.createSpy('translate').and.returnValue('No connection to the server.');

    expect(toAppError(error, translate)).toEqual({
      kind: 'network',
      message: 'No connection to the server.',
    });
    expect(translate).toHaveBeenCalledOnceWith('errors.network');
  });

  it('returns an unauthorized AppError when the status is 401, translating errors.unauthorized', () => {
    const error = new HttpErrorResponse({ status: 401 });
    const translate = jasmine.createSpy('translate').and.returnValue('Session expired.');

    expect(toAppError(error, translate)).toEqual({
      kind: 'unauthorized',
      message: 'Session expired.',
    });
    expect(translate).toHaveBeenCalledOnceWith('errors.unauthorized');
  });

  it('returns a server AppError with the status code and backend message for other statuses, without translating anything', () => {
    const error = new HttpErrorResponse({
      status: 422,
      error: { message: 'Title is required.' },
    });
    const translate = jasmine.createSpy('translate');

    expect(toAppError(error, translate)).toEqual({
      kind: 'server',
      message: 'Title is required.',
      statusCode: 422,
    });
    // The backend already sent a message; translate() is only the fallback
    // for when it doesn't, so it must not be called here.
    expect(translate).not.toHaveBeenCalled();
  });

  it('falls back to translating errors.server when the backend does not send its own message', () => {
    const error = new HttpErrorResponse({ status: 500, error: null });
    const translate = jasmine.createSpy('translate').and.returnValue('Unexpected server error.');

    expect(toAppError(error, translate)).toEqual({
      kind: 'server',
      message: 'Unexpected server error.',
      statusCode: 500,
    });
    expect(translate).toHaveBeenCalledOnceWith('errors.server');
  });
});
