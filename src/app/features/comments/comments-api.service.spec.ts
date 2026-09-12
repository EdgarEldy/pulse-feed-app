import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { apiEndpoints } from '../../core/http/api-endpoints';
import { provideTestTranslations } from '../../testing/translate-testing';
import { CommentsApiService } from './comments-api.service';

const sampleCommentDto = {
  id: 'comment-1',
  postId: 'post-1',
  authorId: 'user-1',
  authorName: 'Ada Lovelace',
  authorPhotoUrl: 'https://example.com/ada.jpg',
  content: 'Nice post!',
  createdAt: '2024-01-01T00:00:00.000Z',
};

describe('CommentsApiService', () => {
  let service: CommentsApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideTestTranslations()],
    });

    service = TestBed.inject(CommentsApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('getComments fetches GET /posts/:postId/comments with a limit and maps the response', () => {
    let result: { items: unknown; nextCursor: string | null } | undefined;
    service.getComments('post-1').subscribe((page) => (result = page));

    const req = httpMock.expectOne(
      (request) =>
        request.url === `${environment.apiBaseUrl}${apiEndpoints.comments.forPost('post-1')}` && request.method === 'GET',
    );
    expect(req.request.params.get('limit')).toBe('20');
    expect(req.request.params.has('cursor')).toBeFalse();
    req.flush({ items: [sampleCommentDto], nextCursor: 'cursor-2' });

    expect(result).toEqual({ items: [sampleCommentDto], nextCursor: 'cursor-2' });
  });

  it('getComments forwards a provided cursor as a query param', () => {
    service.getComments('post-1', 'cursor-1').subscribe();

    const req = httpMock.expectOne(
      (request) => request.url === `${environment.apiBaseUrl}${apiEndpoints.comments.forPost('post-1')}`,
    );
    expect(req.request.params.get('cursor')).toBe('cursor-1');
    req.flush({ items: [], nextCursor: null });
  });

  it('getComments surfaces a validation AppError when the response fails schema validation', () => {
    let error: unknown;
    service.getComments('post-1').subscribe({ error: (err: unknown) => (error = err) });

    const req = httpMock.expectOne(
      (request) => request.url === `${environment.apiBaseUrl}${apiEndpoints.comments.forPost('post-1')}`,
    );
    req.flush({ items: [{ id: 'comment-1' }], nextCursor: null });

    expect((error as { kind: string }).kind).toBe('validation');
  });

  it('addComment posts the content to /posts/:postId/comments and maps the response', () => {
    let result: unknown;
    service.addComment({ postId: 'post-1', content: 'Nice post!' }).subscribe((comment) => (result = comment));

    const req = httpMock.expectOne(`${environment.apiBaseUrl}${apiEndpoints.comments.forPost('post-1')}`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ content: 'Nice post!' });
    req.flush(sampleCommentDto);

    expect(result).toEqual(sampleCommentDto);
  });

  it('addComment maps a status-0 response to a network AppError', () => {
    let error: unknown;
    service.addComment({ postId: 'post-1', content: 'Nice post!' }).subscribe({ error: (err: unknown) => (error = err) });

    const req = httpMock.expectOne(`${environment.apiBaseUrl}${apiEndpoints.comments.forPost('post-1')}`);
    req.error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });

    expect(error).toEqual({ kind: 'network', message: 'No connection to the server.' });
  });

  it('deleteComment sends DELETE /comments/:id', () => {
    let completed = false;
    service.deleteComment('comment-1').subscribe({ complete: () => (completed = true) });

    const req = httpMock.expectOne(`${environment.apiBaseUrl}${apiEndpoints.comments.byId('comment-1')}`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);

    expect(completed).toBeTrue();
  });
});
