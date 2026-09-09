import { HttpClient, HttpErrorResponse, HttpEvent, HttpEventType, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, filter, map, throwError } from 'rxjs';
import { z } from 'zod';
import { environment } from '../../../environments/environment';
import { AppError } from '../models/app-error';
import { toAppError } from './http-error.util';

export type QueryParams = Record<string, string | number | boolean | undefined | null>;

/**
 * Emitted by `postMultipartWithProgress` while an upload is in flight, and
 * finally once with the parsed response body attached. Modeled as a union
 * rather than two separate observables so a single `subscribe` can drive
 * both a progress bar and the "upload finished" transition.
 */
export type UploadEvent<T> = { progress: number } | { progress: 100; result: T };

/**
 * The single place every `*ApiService` in the app routes its `HttpClient`
 * calls through. It exists so none of the following has to be repeated in
 * every feature's API service: prefixing `API_BASE_URL`, turning a plain
 * object into `HttpParams`, validating the response body against a `zod`
 * schema, and mapping a failed request to the app's own `AppError` shape.
 *
 * Schema validation happens here, once, rather than at each call site
 * that later reads the response, so a malformed payload is caught the
 * moment it crosses the network boundary instead of surfacing later as a
 * confusing `undefined` deep inside a component or facade service.
 */
@Injectable({ providedIn: 'root' })
export class BaseApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl;

  get<T>(path: string, params?: QueryParams, schema?: z.ZodType<T>): Observable<T> {
    return this.http.get<unknown>(this.url(path), { params: this.toHttpParams(params) }).pipe(
      map((body) => this.parse(body, schema)),
      catchError((error: unknown) => this.handleError(error)),
    );
  }

  post<T>(path: string, body: unknown, schema?: z.ZodType<T>): Observable<T> {
    return this.http.post<unknown>(this.url(path), body).pipe(
      map((responseBody) => this.parse(responseBody, schema)),
      catchError((error: unknown) => this.handleError(error)),
    );
  }

  patch<T>(path: string, body: unknown, schema?: z.ZodType<T>): Observable<T> {
    return this.http.patch<unknown>(this.url(path), body).pipe(
      map((responseBody) => this.parse(responseBody, schema)),
      catchError((error: unknown) => this.handleError(error)),
    );
  }

  delete<T>(path: string, schema?: z.ZodType<T>): Observable<T> {
    return this.http.delete<unknown>(this.url(path)).pipe(
      map((body) => this.parse(body, schema)),
      catchError((error: unknown) => this.handleError(error)),
    );
  }

  /**
   * Used for the two multipart uploads in the API Contract (avatar, post
   * image). `reportProgress: true` combined with `observe: 'events'` is
   * what makes `HttpClient` emit intermediate `UploadProgress` events as
   * the request body streams to the server, instead of only the final
   * response; without both options set, no progress events are emitted at
   * all, only the terminal response.
   */
  postMultipartWithProgress<T>(path: string, formData: FormData, schema?: z.ZodType<T>): Observable<UploadEvent<T>> {
    return this.http.post(this.url(path), formData, { reportProgress: true, observe: 'events' }).pipe(
      map((event) => this.toUploadEvent(event, schema)),
      filter((event): event is UploadEvent<T> => event !== null),
      catchError((error: unknown) => this.handleError(error)),
    );
  }

  private toUploadEvent<T>(event: HttpEvent<unknown>, schema?: z.ZodType<T>): UploadEvent<T> | null {
    switch (event.type) {
      case HttpEventType.UploadProgress:
        return { progress: event.total ? Math.round((100 * event.loaded) / event.total) : 0 };
      case HttpEventType.Response:
        return { progress: 100, result: this.parse(event.body, schema) };
      default:
        return null;
    }
  }

  private url(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  private toHttpParams(params?: QueryParams): HttpParams {
    let httpParams = new HttpParams();
    if (!params) {
      return httpParams;
    }
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) {
        continue;
      }
      httpParams = httpParams.set(key, value);
    }
    return httpParams;
  }

  private parse<T>(body: unknown, schema?: z.ZodType<T>): T {
    if (!schema) {
      return body as T;
    }
    const result = schema.safeParse(body);
    if (!result.success) {
      const validationError: AppError = {
        kind: 'validation',
        message: `Response failed schema validation: ${z.prettifyError(result.error)}`,
      };
      throw validationError;
    }
    return result.data;
  }

  private handleError(error: unknown): Observable<never> {
    if (this.isAppError(error)) {
      return throwError(() => error);
    }
    return throwError(() => toAppError(error as HttpErrorResponse));
  }

  private isAppError(error: unknown): error is AppError {
    return typeof error === 'object' && error !== null && 'kind' in error && 'message' in error;
  }
}
