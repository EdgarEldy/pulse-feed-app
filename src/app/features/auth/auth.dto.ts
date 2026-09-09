import { z } from 'zod';
import { UserDto, toUser, userDtoSchema } from '../users/user.dto';
import { AuthSession, RefreshedSession } from './auth.model';

/**
 * Wire shape of `POST /auth/register`/`POST /auth/login`/`POST /auth/google`'s
 * response. Its `user` field is validated with `userDtoSchema` rather than
 * a second, hand-written copy of the same shape, so a user's DTO schema
 * only ever exists in one place even though it is nested here.
 */
export interface AuthSessionDto {
  accessToken: string;
  refreshToken: string;
  user: UserDto;
}

export const authSessionDtoSchema: z.ZodType<AuthSessionDto> = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: userDtoSchema,
});

export function toAuthSession(dto: AuthSessionDto): AuthSession {
  return {
    accessToken: dto.accessToken,
    refreshToken: dto.refreshToken,
    user: toUser(dto.user),
  };
}

/**
 * Wire shape of `POST /auth/refresh`'s response. Kept separate from
 * `AuthSessionDto` for the same reason `RefreshedSession` is kept
 * separate from `AuthSession`: it is a genuinely smaller payload, not a
 * subset carved out of the bigger one after the fact.
 */
export interface RefreshedSessionDto {
  accessToken: string;
}

export const refreshedSessionDtoSchema: z.ZodType<RefreshedSessionDto> = z.object({
  accessToken: z.string(),
});

export function toRefreshedSession(dto: RefreshedSessionDto): RefreshedSession {
  return {
    accessToken: dto.accessToken,
  };
}
