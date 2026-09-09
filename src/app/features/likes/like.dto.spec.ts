import { likeStatusSchema, likeToggleResultSchema } from './like.dto';

describe('likeToggleResultSchema', () => {
  const samplePayload = { liked: true, likesCount: 4 };

  it('accepts a valid POST /posts/:postId/likes response', () => {
    const result = likeToggleResultSchema.safeParse(samplePayload);

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.data).toEqual(samplePayload);
  });

  it('fails validation when likesCount is missing', () => {
    const { likesCount, ...invalidPayload } = samplePayload;

    const result = likeToggleResultSchema.safeParse(invalidPayload);

    expect(result.success).toBe(false);
  });

  it('fails validation when liked has the wrong type', () => {
    const invalidPayload = { ...samplePayload, liked: 'yes' };

    const result = likeToggleResultSchema.safeParse(invalidPayload);

    expect(result.success).toBe(false);
  });
});

describe('likeStatusSchema', () => {
  it('accepts a valid GET /posts/:postId/likes/me response', () => {
    const result = likeStatusSchema.safeParse({ liked: false });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.data).toEqual({ liked: false });
  });

  it('fails validation when liked is missing', () => {
    const result = likeStatusSchema.safeParse({});

    expect(result.success).toBe(false);
  });
});
