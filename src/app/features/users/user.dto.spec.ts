import { UserDto, toUser, userDtoSchema } from './user.dto';

describe('userDtoSchema / toUser', () => {
  const samplePayload: UserDto = {
    id: 'user-1',
    displayName: 'Ada Lovelace',
    email: 'ada@example.com',
    photoUrl: 'https://cdn.example.com/avatars/ada.png',
    createdAt: '2024-01-15T09:30:00.000Z',
  };

  it('maps a valid API payload to the User model', () => {
    const result = userDtoSchema.safeParse(samplePayload);

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    const user = toUser(result.data);

    expect(user).toEqual({
      id: 'user-1',
      displayName: 'Ada Lovelace',
      email: 'ada@example.com',
      photoUrl: 'https://cdn.example.com/avatars/ada.png',
      createdAt: '2024-01-15T09:30:00.000Z',
    });
  });

  it('fails validation when email is not a valid email address', () => {
    const invalidPayload = { ...samplePayload, email: 'not-an-email' };

    const result = userDtoSchema.safeParse(invalidPayload);

    expect(result.success).toBe(false);
  });

  it('fails validation when a required field is missing', () => {
    const { displayName, ...invalidPayload } = samplePayload;

    const result = userDtoSchema.safeParse(invalidPayload);

    expect(result.success).toBe(false);
  });

  it('fails validation when a field has the wrong type', () => {
    const invalidPayload = { ...samplePayload, createdAt: 12345 };

    const result = userDtoSchema.safeParse(invalidPayload);

    expect(result.success).toBe(false);
  });
});
