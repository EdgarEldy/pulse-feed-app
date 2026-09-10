import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { apiEndpoints } from '../../core/http/api-endpoints';
import { PostsApiService } from './posts-api.service';

const samplePostDto = {
  id: 'post-1',
  authorId: 'user-1',
  authorName: 'Ada Lovelace',
  authorPhotoUrl: 'https://example.com/ada.jpg',
  title: 'Hello world',
  content: 'My first post',
  createdAt: '2024-01-01T00:00:00.000Z',
  commentsCount: 0,
  likesCount: 0,
  isLikedByMe: false,
};

// `toPost()` maps every field unconditionally, `imageUrl`/`updatedAt`
// included, so a mapped `Post` carries them as explicit `undefined`
// properties even when the wire payload never sent them at all; matching
// that shape here keeps `toEqual` comparing like with like below.
const expectedPost = { ...samplePostDto, imageUrl: undefined, updatedAt: undefined };

describe('PostsApiService', () => {
  let service: PostsApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(PostsApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('getPosts fetches GET /posts with a limit and maps the response to Post items', () => {
    let result: { items: unknown; nextCursor: string | null } | undefined;
    service.getPosts().subscribe((page) => (result = page));

    const req = httpMock.expectOne(
      (request) => request.url === `${environment.apiBaseUrl}${apiEndpoints.posts.list}` && request.method === 'GET',
    );
    expect(req.request.params.get('limit')).toBe('20');
    expect(req.request.params.has('cursor')).toBeFalse();
    req.flush({ items: [samplePostDto], nextCursor: 'cursor-2' });

    expect(result).toEqual({ items: [expectedPost], nextCursor: 'cursor-2' });
  });

  it('getPosts forwards a provided cursor as a query param', () => {
    service.getPosts('cursor-1').subscribe();

    const req = httpMock.expectOne(
      (request) => request.url === `${environment.apiBaseUrl}${apiEndpoints.posts.list}` && request.method === 'GET',
    );
    expect(req.request.params.get('cursor')).toBe('cursor-1');
    req.flush({ items: [], nextCursor: null });
  });

  it('getPost fetches GET /posts/:id and maps the response to a Post', () => {
    let result: unknown;
    service.getPost('post-1').subscribe((post) => (result = post));

    const req = httpMock.expectOne(`${environment.apiBaseUrl}${apiEndpoints.posts.byId('post-1')}`);
    expect(req.request.method).toBe('GET');
    req.flush(samplePostDto);

    expect(result).toEqual(expectedPost);
  });

  it('getPost surfaces a validation AppError when the response fails schema validation', () => {
    let error: unknown;
    service.getPost('post-1').subscribe({ error: (err: unknown) => (error = err) });

    const req = httpMock.expectOne(`${environment.apiBaseUrl}${apiEndpoints.posts.byId('post-1')}`);
    req.flush({ id: 'post-1' });

    expect((error as { kind: string }).kind).toBe('validation');
  });

  it('updatePost patches /posts/:id with the changed fields and maps the response to a Post', () => {
    let result: unknown;
    service.updatePost('post-1', { title: 'Updated title' }).subscribe((post) => (result = post));

    const req = httpMock.expectOne(`${environment.apiBaseUrl}${apiEndpoints.posts.byId('post-1')}`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ title: 'Updated title' });
    req.flush({ ...samplePostDto, title: 'Updated title' });

    expect(result).toEqual({ ...expectedPost, title: 'Updated title' });
  });

  it('updatePost maps a status-0 response to a network AppError', () => {
    let error: unknown;
    service.updatePost('post-1', { title: 'Updated title' }).subscribe({ error: (err: unknown) => (error = err) });

    const req = httpMock.expectOne(`${environment.apiBaseUrl}${apiEndpoints.posts.byId('post-1')}`);
    req.error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });

    expect(error).toEqual({ kind: 'network', message: 'No connection to the server.' });
  });

  it('deletePost sends DELETE /posts/:id', () => {
    let completed = false;
    service.deletePost('post-1').subscribe({ complete: () => (completed = true) });

    const req = httpMock.expectOne(`${environment.apiBaseUrl}${apiEndpoints.posts.byId('post-1')}`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);

    expect(completed).toBeTrue();
  });
});
