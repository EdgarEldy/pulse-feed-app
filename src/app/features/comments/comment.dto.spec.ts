import { CommentRow } from './comment.model';
import { CommentDto, commentDtoSchema, toComment, toCommentPayload } from './comment.dto';

describe('commentDtoSchema / toComment', () => {
  const samplePayload: CommentDto = {
    id: 'comment-1',
    postId: 'post-1',
    authorId: 'user-1',
    authorName: 'Ada Lovelace',
    authorPhotoUrl: 'https://cdn.example.com/avatars/ada.png',
    content: 'Great post!',
    createdAt: '2024-01-15T09:45:00.000Z',
  };

  it('maps a valid API payload to the Comment model', () => {
    const result = commentDtoSchema.safeParse(samplePayload);

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    const comment = toComment(result.data);

    expect(comment).toEqual({
      id: 'comment-1',
      postId: 'post-1',
      authorId: 'user-1',
      authorName: 'Ada Lovelace',
      authorPhotoUrl: 'https://cdn.example.com/avatars/ada.png',
      content: 'Great post!',
      createdAt: '2024-01-15T09:45:00.000Z',
    });
  });

  it('fails validation when a required field is missing', () => {
    const { content, ...invalidPayload } = samplePayload;

    const result = commentDtoSchema.safeParse(invalidPayload);

    expect(result.success).toBe(false);
  });

  it('fails validation when postId has the wrong type', () => {
    const invalidPayload = { ...samplePayload, postId: 42 };

    const result = commentDtoSchema.safeParse(invalidPayload);

    expect(result.success).toBe(false);
  });
});

describe('toCommentPayload', () => {
  it('strips pendingSync and preserves every other field', () => {
    const row: CommentRow = {
      id: 'temp-def456',
      postId: 'post-1',
      authorId: 'user-1',
      authorName: 'Ada Lovelace',
      authorPhotoUrl: 'https://cdn.example.com/avatars/ada.png',
      content: 'Written while offline.',
      createdAt: '2024-01-15T09:45:00.000Z',
      pendingSync: true,
    };

    const payload = toCommentPayload(row);

    expect('pendingSync' in payload).toBe(false);
    expect(payload).toEqual({
      id: 'temp-def456',
      postId: 'post-1',
      authorId: 'user-1',
      authorName: 'Ada Lovelace',
      authorPhotoUrl: 'https://cdn.example.com/avatars/ada.png',
      content: 'Written while offline.',
      createdAt: '2024-01-15T09:45:00.000Z',
    });
  });

  it('strips pendingSync even when it is false', () => {
    const row: CommentRow = {
      id: 'comment-1',
      postId: 'post-1',
      authorId: 'user-1',
      authorName: 'Ada Lovelace',
      authorPhotoUrl: 'https://cdn.example.com/avatars/ada.png',
      content: 'Already synced with the server.',
      createdAt: '2024-01-15T09:45:00.000Z',
      pendingSync: false,
    };

    const payload = toCommentPayload(row);

    expect('pendingSync' in payload).toBe(false);
  });
});
