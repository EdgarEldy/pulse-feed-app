import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { z } from 'zod';
import { apiEndpoints } from '../../core/http/api-endpoints';
import { BaseApiService, UploadEvent } from '../../core/http/base-api.service';
import { UserDto, toUser, userDtoSchema } from './user.dto';
import { User } from './user.model';

/**
 * The API Contract's `POST /users/me/avatar` response is just `{ photoUrl
 * }`, small enough that hand-writing a one-off interface would work too,
 * but a `zod` schema is used anyway to stay consistent with this
 * codebase's "validate everything crossing the network boundary" rule
 * rather than carving out an exception for the smallest payload.
 */
const avatarUploadResponseSchema = z.object({ photoUrl: z.string() });
type AvatarUploadResponse = z.infer<typeof avatarUploadResponseSchema>;

/**
 * Talks to `/users/*` over `BaseApiService`, exactly like every other
 * `*ApiService`: no direct `HttpClient` use, no hand-written
 * `HttpErrorResponse` handling, no inline `zod` parsing beyond declaring
 * the schemas themselves. `UsersService` (the facade) is the only thing
 * that injects this service.
 */
@Injectable({ providedIn: 'root' })
export class UsersApiService {
  private readonly api = inject(BaseApiService);

  getUser(id: string): Observable<User> {
    return this.api.get<UserDto>(apiEndpoints.users.byId(id), undefined, userDtoSchema).pipe(map(toUser));
  }

  /**
   * Per the API Contract, `PATCH /users/me` only accepts `displayName`;
   * email and photo have their own dedicated update paths (photo via
   * `uploadAvatar` below, email isn't editable at all per the contract),
   * so no other field is accepted here.
   */
  updateProfile(displayName: string): Observable<User> {
    return this.api.patch<UserDto>(apiEndpoints.users.me, { displayName }, userDtoSchema).pipe(map(toUser));
  }

  /**
   * `reportProgress`/upload-event handling itself lives entirely in
   * `BaseApiService.postMultipartWithProgress`; this method's only job is
   * building the `FormData` the API Contract expects (a single `file`
   * field) and handing it off.
   */
  uploadAvatar(file: File): Observable<UploadEvent<AvatarUploadResponse>> {
    const formData = new FormData();
    formData.append('file', file);
    return this.api.postMultipartWithProgress<AvatarUploadResponse>(apiEndpoints.users.meAvatar, formData, avatarUploadResponseSchema);
  }
}
