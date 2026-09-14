import { PostRow } from './post.model';
import { PostDto, postDtoSchema, toPost, toPostPayload } from './post.dto';

describe('postDtoSchema / toPost', () => {
  const samplePayload: PostDto = {
    id: 'post-1',
    authorId: 'user-1',
    authorName: 'Ada Lovelace',
    authorPhotoUrl: 'https://cdn.example.com/avatars/ada.png',
    title: 'Hello world',
    content: 'My first post on PulseFeed.',
    imageUrl: 'https://cdn.example.com/posts/post-1.png',
    createdAt: '2024-01-15T09:30:00.000Z',
    updatedAt: '2024-01-16T10:00:00.000Z',
    commentsCount: 3,
    likesCount: 12,
    isLikedByMe: true,
  };

  it('maps a valid API payload to the Post model', () => {
    const result = postDtoSchema.safeParse(samplePayload);

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    const post = toPost(result.data);

    expect(post).toEqual({
      id: 'post-1',
      authorId: 'user-1',
      authorName: 'Ada Lovelace',
      authorPhotoUrl: 'https://cdn.example.com/avatars/ada.png',
      title: 'Hello world',
      content: 'My first post on PulseFeed.',
      imageUrl: 'https://cdn.example.com/posts/post-1.png',
      createdAt: '2024-01-15T09:30:00.000Z',
      updatedAt: '2024-01-16T10:00:00.000Z',
      commentsCount: 3,
      likesCount: 12,
      isLikedByMe: true,
    });
  });

  it('accepts a payload with no image and no updatedAt, since a post may never have been edited', () => {
    const { imageUrl, updatedAt, ...payloadWithoutOptionalFields } = samplePayload;

    const result = postDtoSchema.safeParse(payloadWithoutOptionalFields);

    expect(result.success).toBe(true);
  });

  it('fails validation when a required field is missing', () => {
    const { title, ...invalidPayload } = samplePayload;

    const result = postDtoSchema.safeParse(invalidPayload);

    expect(result.success).toBe(false);
  });

  it('fails validation when commentsCount has the wrong type', () => {
    const invalidPayload = { ...samplePayload, commentsCount: '3' };

    const result = postDtoSchema.safeParse(invalidPayload);

    expect(result.success).toBe(false);
  });
});

describe('toPostPayload', () => {
  it('strips pendingSync and preserves every other field', () => {
    const row: PostRow = {
      id: 'temp-abc123',
      authorId: 'user-1',
      authorName: 'Ada Lovelace',
      authorPhotoUrl: 'https://cdn.example.com/avatars/ada.png',
      title: 'Queued post',
      content: 'Written while offline.',
      imageUrl: 'https://cdn.example.com/posts/queued.png',
      createdAt: '2024-01-15T09:30:00.000Z',
      updatedAt: '2024-01-16T10:00:00.000Z',
      commentsCount: 0,
      likesCount: 0,
      isLikedByMe: false,
      pendingSync: true,
    };

    const payload = toPostPayload(row);

    expect('pendingSync' in payload).toBe(false);
    expect(payload).toEqual({
      id: 'temp-abc123',
      authorId: 'user-1',
      authorName: 'Ada Lovelace',
      authorPhotoUrl: 'https://cdn.example.com/avatars/ada.png',
      title: 'Queued post',
      content: 'Written while offline.',
      imageUrl: 'https://cdn.example.com/posts/queued.png',
      createdAt: '2024-01-15T09:30:00.000Z',
      updatedAt: '2024-01-16T10:00:00.000Z',
      commentsCount: 0,
      likesCount: 0,
      isLikedByMe: false,
    });
  });

  it('strips pendingSync even when it is false', () => {
    const row: PostRow = {
      id: 'post-1',
      authorId: 'user-1',
      authorName: 'Ada Lovelace',
      authorPhotoUrl: 'https://cdn.example.com/avatars/ada.png',
      title: 'Synced post',
      content: 'Already synced with the server.',
      createdAt: '2024-01-15T09:30:00.000Z',
      commentsCount: 2,
      likesCount: 5,
      isLikedByMe: false,
      pendingSync: false,
    };

    const payload = toPostPayload(row);

    expect('pendingSync' in payload).toBe(false);
  });
});
