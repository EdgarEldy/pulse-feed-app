import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { apiEndpoints } from '../../core/http/api-endpoints';
import { BaseApiService } from '../../core/http/base-api.service';
import { AuthSessionDto, RefreshedSessionDto, authSessionDtoSchema, refreshedSessionDtoSchema, toAuthSession, toRefreshedSession } from './auth.dto';
import { AuthSession, RefreshedSession } from './auth.model';

/**
 * Talks to `/auth/*` over `BaseApiService`, exactly like every other
 * `*ApiService`: no direct `HttpClient` use, no hand-written
 * `HttpErrorResponse` handling, no inline `zod` parsing. Each response is
 * validated against its DTO schema by `BaseApiService` itself, then mapped
 * to the app's own model with the matching `to*` function from
 * `auth.dto.ts`, so this service only ever hands back `AuthSession`/
 * `RefreshedSession`, never the raw wire shape.
 *
 * `AuthService` (a later task on this branch) is the only thing that
 * injects this service; it is the one that decides what to do with a
 * session once obtained (store the tokens, update `currentUser`, and so
 * on). This service does not know `SecureTokenStorageService` exists.
 */
@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly api = inject(BaseApiService);

  register(email: string, password: string, displayName: string): Observable<AuthSession> {
    return this.api
      .post<AuthSessionDto>(apiEndpoints.auth.register, { email, password, displayName }, authSessionDtoSchema)
      .pipe(map(toAuthSession));
  }

  login(email: string, password: string): Observable<AuthSession> {
    return this.api.post<AuthSessionDto>(apiEndpoints.auth.login, { email, password }, authSessionDtoSchema).pipe(map(toAuthSession));
  }

  refresh(refreshToken: string): Observable<RefreshedSession> {
    return this.api
      .post<RefreshedSessionDto>(apiEndpoints.auth.refresh, { refreshToken }, refreshedSessionDtoSchema)
      .pipe(map(toRefreshedSession));
  }

  /**
   * `POST /auth/logout` responds `204 No Content`, so no schema is passed:
   * there is no body to validate, and `BaseApiService.post` returns
   * whatever the (empty) body parses to as-is when no schema is given.
   */
  logout(refreshToken: string): Observable<void> {
    return this.api.post<void>(apiEndpoints.auth.logout, { refreshToken });
  }
}
