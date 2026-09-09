import { HttpEventType, HttpProgressEvent, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { z } from 'zod';
import { environment } from '../../../environments/environment';
import { AppError } from '../models/app-error';
import { BaseApiService, UploadEvent } from './base-api.service';

describe('BaseApiService', () => {
  let service: BaseApiService;
  let httpMock: HttpTestingController;

  const postSchema = z.object({ id: z.string(), title: z.string() });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(BaseApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('get', () => {
    it('sends a GET request with serialized query params and resolves the parsed body', (done) => {
      service.get<{ items: string[] }>('/posts', { cursor: 'abc', limit: 10, ghost: undefined }).subscribe((body) => {
        expect(body).toEqual({ items: ['1'] });
        done();
      });

      const req = httpMock.expectOne(
        (request) =>
          request.url === `${environment.apiBaseUrl}/posts` &&
          request.params.get('cursor') === 'abc' &&
          request.params.get('limit') === '10' &&
          !request.params.has('ghost'),
      );
      expect(req.request.method).toBe('GET');
      req.flush({ items: ['1'] });
    });
  });

  describe('post', () => {
    it('sends a POST request with the given body and resolves the parsed response', (done) => {
      service.post<{ id: string }>('/posts', { title: 'Hello' }).subscribe((body) => {
        expect(body).toEqual({ id: '1' });
        done();
      });

      const req = httpMock.expectOne(`${environment.apiBaseUrl}/posts`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ title: 'Hello' });
      req.flush({ id: '1' });
    });
  });

  describe('patch', () => {
    it('sends a PATCH request with the given body and resolves the parsed response', (done) => {
      service.patch<{ id: string; title: string }>('/posts/1', { title: 'Updated' }).subscribe((body) => {
        expect(body).toEqual({ id: '1', title: 'Updated' });
        done();
      });

      const req = httpMock.expectOne(`${environment.apiBaseUrl}/posts/1`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ title: 'Updated' });
      req.flush({ id: '1', title: 'Updated' });
    });
  });

  describe('delete', () => {
    it('sends a DELETE request and resolves the parsed response', (done) => {
      service.delete('/posts/1').subscribe((body) => {
        expect(body).toBeNull();
        done();
      });

      const req = httpMock.expectOne(`${environment.apiBaseUrl}/posts/1`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
    });
  });

  describe('schema validation', () => {
    it('resolves the parsed body when it matches the provided zod schema', (done) => {
      service.get('/posts/1', undefined, postSchema).subscribe((post) => {
        expect(post).toEqual({ id: '1', title: 'Hello' });
        done();
      });

      const req = httpMock.expectOne(`${environment.apiBaseUrl}/posts/1`);
      req.flush({ id: '1', title: 'Hello' });
    });

    it('emits a validation AppError when the response fails schema validation', (done) => {
      service.get('/posts/1', undefined, postSchema).subscribe({
        next: () => fail('expected a validation error, got a success value'),
        error: (error: AppError) => {
          expect(error.kind).toBe('validation');
          expect(error.message).toContain('Response failed schema validation');
          done();
        },
      });

      const req = httpMock.expectOne(`${environment.apiBaseUrl}/posts/1`);
      req.flush({ id: '1' });
    });
  });

  describe('error mapping', () => {
    it('maps a non-2xx response to an AppError via toAppError', (done) => {
      service.get('/posts/999').subscribe({
        next: () => fail('expected an error, got a success value'),
        error: (error: AppError) => {
          expect(error).toEqual({
            kind: 'server',
            message: 'Post not found.',
            statusCode: 404,
          });
          done();
        },
      });

      const req = httpMock.expectOne(`${environment.apiBaseUrl}/posts/999`);
      req.flush({ message: 'Post not found.' }, { status: 404, statusText: 'Not Found' });
    });

    it('maps a status 0 response to a network AppError', (done) => {
      service.get('/posts').subscribe({
        next: () => fail('expected an error, got a success value'),
        error: (error: AppError) => {
          expect(error.kind).toBe('network');
          done();
        },
      });

      const req = httpMock.expectOne(`${environment.apiBaseUrl}/posts`);
      req.error(new ProgressEvent('error'), { status: 0 });
    });
  });

  describe('postMultipartWithProgress', () => {
    it('emits progress events followed by a final parsed result', (done) => {
      const events: UploadEvent<{ photoUrl: string }>[] = [];

      service.postMultipartWithProgress<{ photoUrl: string }>('/users/me/avatar', new FormData()).subscribe({
        next: (event) => events.push(event),
        complete: () => {
          expect(events).toEqual([
            { progress: 50 },
            { progress: 100, result: { photoUrl: 'https://cdn.example.com/avatar.png' } },
          ]);
          done();
        },
      });

      const req = httpMock.expectOne(`${environment.apiBaseUrl}/users/me/avatar`);
      expect(req.request.method).toBe('POST');

      req.event({ type: HttpEventType.UploadProgress, loaded: 50, total: 100 } as HttpProgressEvent);
      req.flush({ photoUrl: 'https://cdn.example.com/avatar.png' });
    });
  });
});
