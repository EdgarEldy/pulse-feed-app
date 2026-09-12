import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { apiEndpoints } from '../../core/http/api-endpoints';
import { provideTestTranslations } from '../../testing/translate-testing';
import { LikesApiService } from './likes-api.service';

describe('LikesApiService', () => {
  let service: LikesApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideTestTranslations()],
    });

    service = TestBed.inject(LikesApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('toggle posts to /posts/:postId/likes with no body and maps the response', () => {
    let result: unknown;
    service.toggle('post-1').subscribe((response) => (result = response));

    const req = httpMock.expectOne(`${environment.apiBaseUrl}${apiEndpoints.likes.forPost('post-1')}`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBeNull();
    req.flush({ liked: true, likesCount: 4 });

    expect(result).toEqual({ liked: true, likesCount: 4 });
  });

  it('toggle surfaces a validation AppError when the response fails schema validation', () => {
    let error: unknown;
    service.toggle('post-1').subscribe({ error: (err: unknown) => (error = err) });

    const req = httpMock.expectOne(`${environment.apiBaseUrl}${apiEndpoints.likes.forPost('post-1')}`);
    req.flush({ liked: 'yes' });

    expect((error as { kind: string }).kind).toBe('validation');
  });

  it('toggle maps a status-0 response to a network AppError', () => {
    let error: unknown;
    service.toggle('post-1').subscribe({ error: (err: unknown) => (error = err) });

    const req = httpMock.expectOne(`${environment.apiBaseUrl}${apiEndpoints.likes.forPost('post-1')}`);
    req.error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });

    expect(error).toEqual({ kind: 'network', message: 'No connection to the server.' });
  });

  it('getStatus fetches GET /posts/:postId/likes/me and maps the response', () => {
    let result: unknown;
    service.getStatus('post-1').subscribe((status) => (result = status));

    const req = httpMock.expectOne(`${environment.apiBaseUrl}${apiEndpoints.likes.meForPost('post-1')}`);
    expect(req.request.method).toBe('GET');
    req.flush({ liked: false });

    expect(result).toEqual({ liked: false });
  });

  it('getStatus surfaces a validation AppError when the response fails schema validation', () => {
    let error: unknown;
    service.getStatus('post-1').subscribe({ error: (err: unknown) => (error = err) });

    const req = httpMock.expectOne(`${environment.apiBaseUrl}${apiEndpoints.likes.meForPost('post-1')}`);
    req.flush({});

    expect((error as { kind: string }).kind).toBe('validation');
  });
});
