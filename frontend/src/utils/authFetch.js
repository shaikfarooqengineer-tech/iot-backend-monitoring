/**
 * Centralized auth fetch utility for cross-domain token-based authentication.
 * Automatically attaches the Bearer token from localStorage to every request.
 */

export function getAuthHeaders(extraHeaders = {}) {
  const token = localStorage.getItem('session_token');
  const headers = { ...extraHeaders };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export function authFetch(url, options = {}) {
  const { headers = {}, ...rest } = options;
  return fetch(url, {
    ...rest,
    credentials: 'include',
    headers: getAuthHeaders(headers)
  });
}
