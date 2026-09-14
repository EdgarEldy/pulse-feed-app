/**
 * Turns a local file URI (a Capacitor Camera/Filesystem `webPath`, on both
 * the web build and inside the native WebView) into an uploadable `File`.
 * Shared by `AvatarPickerComponent` and `PostsApiService` so the
 * `fetch -> blob -> File` conversion, and its extension-guessing rule, live
 * in exactly one place rather than two copies that can silently drift apart.
 */
export async function fileFromUri(uri: string, filenameBase: string, formatHint?: string): Promise<File> {
  const response = await fetch(uri);
  const blob = await response.blob();
  const extension = formatHint ?? blob.type.split('/')[1] ?? 'jpeg';
  return new File([blob], `${filenameBase}.${extension}`, { type: blob.type });
}
