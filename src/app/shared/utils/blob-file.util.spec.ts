import { fileFromUri } from './blob-file.util';

describe('fileFromUri', () => {
  function stubFetch(blob: Blob): void {
    spyOn(window, 'fetch').and.resolveTo({
      blob: () => Promise.resolve(blob),
    } as Response);
  }

  it('fetches the uri and builds a File named after the blob mime type', async () => {
    stubFetch(new Blob(['bytes'], { type: 'image/png' }));

    const file = await fileFromUri('blob:fake-path', 'post-image');

    expect(window.fetch).toHaveBeenCalledWith('blob:fake-path');
    expect(file.name).toBe('post-image.png');
    expect(file.type).toBe('image/png');
  });

  it('prefers an explicit formatHint over the blob mime type extension', async () => {
    stubFetch(new Blob(['bytes'], { type: 'image/png' }));

    const file = await fileFromUri('blob:fake-path', 'post-image', 'heic');

    expect(file.name).toBe('post-image.heic');
  });

  it('falls back to a jpeg extension when the blob has no usable mime type', async () => {
    stubFetch(new Blob(['bytes'], { type: '' }));

    const file = await fileFromUri('blob:fake-path', 'avatar');

    expect(file.name).toBe('avatar.jpeg');
  });
});
