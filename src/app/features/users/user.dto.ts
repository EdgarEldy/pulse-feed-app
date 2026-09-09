import { z } from 'zod';
import { User } from './user.model';

/**
 * The raw shape the API actually sends for a user, validated with
 * `userDtoSchema` before anything in the app trusts it (see
 * `BaseApiService.parse`). `UserDto` happens to be structurally identical
 * to `User` right now because the API Contract doesn't rename or reshape
 * any of these fields, but it is still its own named type rather than a
 * type alias to `User`.
 *
 * That distinction is the whole point of having a DTO at all: `UserDto`
 * describes what is on the wire, `User` describes what the app works
 * with internally, and `toUser` is the single seam between the two. If
 * the backend later renames a field, nests `user` under an `attributes`
 * key, or sends a Unix timestamp instead of an ISO string, only this
 * file changes — every component and facade service reading `User`
 * keeps compiling untouched.
 */
export interface UserDto {
  id: string;
  displayName: string;
  email: string;
  photoUrl: string;
  createdAt: string;
}

export const userDtoSchema: z.ZodType<UserDto> = z.object({
  id: z.string(),
  displayName: z.string(),
  email: z.email(),
  photoUrl: z.string(),
  createdAt: z.string(),
});

export function toUser(dto: UserDto): User {
  return {
    id: dto.id,
    displayName: dto.displayName,
    email: dto.email,
    photoUrl: dto.photoUrl,
    createdAt: dto.createdAt,
  };
}
