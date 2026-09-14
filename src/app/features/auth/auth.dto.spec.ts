import {
  AuthSessionDto,
  RefreshedSessionDto,
  authSessionDtoSchema,
  refreshedSessionDtoSchema,
  toAuthSession,
  toRefreshedSession,
} from './auth.dto';

describe('authSessionDtoSchema / toAuthSession', () => {
  const samplePayload: AuthSessionDto = {
    accessToken: 'access-token-abc',
    refreshToken: 'refresh-token-xyz',
    user: {
      id: 'user-1',
      displayName: 'Ada Lovelace',
      email: 'ada@example.com',
      photoUrl: 'https://cdn.example.com/avatars/ada.png',
      createdAt: '2024-01-15T09:30:00.000Z',
    },
  };

  it('maps a valid register/login/google response to an AuthSession', () => {
    const result = authSessionDtoSchema.safeParse(samplePayload);

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    const session = toAuthSession(result.data);

    expect(session).toEqual({
      accessToken: 'access-token-abc',
      refreshToken: 'refresh-token-xyz',
      user: {
        id: 'user-1',
        displayName: 'Ada Lovelace',
        email: 'ada@example.com',
        photoUrl: 'https://cdn.example.com/avatars/ada.png',
        createdAt: '2024-01-15T09:30:00.000Z',
      },
    });
  });

  it('fails validation when the refreshToken field is missing', () => {
    const { refreshToken, ...invalidPayload } = samplePayload;

    const result = authSessionDtoSchema.safeParse(invalidPayload);

    expect(result.success).toBe(false);
  });

  it('fails validation when the nested user fails its own schema', () => {
    const invalidPayload = { ...samplePayload, user: { ...samplePayload.user, email: 'not-an-email' } };

    const result = authSessionDtoSchema.safeParse(invalidPayload);

    expect(result.success).toBe(false);
  });
});

describe('refreshedSessionDtoSchema / toRefreshedSession', () => {
  const samplePayload: RefreshedSessionDto = {
    accessToken: 'new-access-token',
  };

  it('maps a valid refresh response to a RefreshedSession', () => {
    const result = refreshedSessionDtoSchema.safeParse(samplePayload);

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    const session = toRefreshedSession(result.data);

    expect(session).toEqual({ accessToken: 'new-access-token' });
  });

  it('fails validation when accessToken has the wrong type', () => {
    const invalidPayload = { accessToken: 12345 };

    const result = refreshedSessionDtoSchema.safeParse(invalidPayload);

    expect(result.success).toBe(false);
  });

  it('fails validation when accessToken is missing', () => {
    const result = refreshedSessionDtoSchema.safeParse({});

    expect(result.success).toBe(false);
  });
});
