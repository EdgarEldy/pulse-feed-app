/**
 * Every REST path the client calls, matching the API Contract in
 * README.md exactly. Static paths are plain strings; paths carrying a
 * route parameter are functions, so a call site like
 * `apiEndpoints.posts.comments(postId)` reads the same way the URL itself
 * is shaped, and a typo in a path segment is caught once here instead of
 * wherever it happens to be interpolated.
 */
export const apiEndpoints = {
  auth: {
    register: '/auth/register',
    login: '/auth/login',
    refresh: '/auth/refresh',
    logout: '/auth/logout',
    google: '/auth/google',
  },
  users: {
    byId: (id: string) => `/users/${id}`,
    me: '/users/me',
    meAvatar: '/users/me/avatar',
  },
  posts: {
    list: '/posts',
    byId: (id: string) => `/posts/${id}`,
  },
  comments: {
    forPost: (postId: string) => `/posts/${postId}/comments`,
    byId: (id: string) => `/comments/${id}`,
  },
  likes: {
    forPost: (postId: string) => `/posts/${postId}/likes`,
    meForPost: (postId: string) => `/posts/${postId}/likes/me`,
  },
  devices: {
    register: '/devices',
    byPushToken: (pushToken: string) => `/devices/${pushToken}`,
  },
} as const;
