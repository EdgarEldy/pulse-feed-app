import { HttpErrorResponse } from '@angular/common/http';
import { toAppError } from './http-error.util';

describe('toAppError', () => {
  it('returns a network AppError when the status is 0', () => {
    const error = new HttpErrorResponse({ status: 0 });

    expect(toAppError(error)).toEqual({
      kind: 'network',
      message: 'No connection to the server.',
    });
  });

  it('returns an unauthorized AppError when the status is 401', () => {
    const error = new HttpErrorResponse({ status: 401 });

    expect(toAppError(error)).toEqual({
      kind: 'unauthorized',
      message: 'Session expired.',
    });
  });

  it('returns a server AppError with the status code and backend message for other statuses', () => {
    const error = new HttpErrorResponse({
      status: 422,
      error: { message: 'Title is required.' },
    });

    expect(toAppError(error)).toEqual({
      kind: 'server',
      message: 'Title is required.',
      statusCode: 422,
    });
  });

  it('falls back to a generic message when the backend does not send one', () => {
    const error = new HttpErrorResponse({ status: 500, error: null });

    expect(toAppError(error)).toEqual({
      kind: 'server',
      message: 'Unexpected server error.',
      statusCode: 500,
    });
  });
});
