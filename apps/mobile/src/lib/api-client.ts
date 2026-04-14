import { useAuthStore } from '../stores/auth.store';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api';

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  skipAuth?: boolean;
}

interface ApiError {
  statusCode: number;
  message: string;
  error?: string;
}

class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly body: ApiError
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (isRefreshing && refreshPromise) return refreshPromise;

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const { refreshToken, updateAccessToken, clearSession } = useAuthStore.getState();
      if (!refreshToken) {
        await clearSession();
        return null;
      }

      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        await clearSession();
        return null;
      }

      const json = await response.json() as { data: { accessToken: string } };
      const newToken = json.data.accessToken;
      await updateAccessToken(newToken);
      return newToken;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {}, skipAuth = false } = options;

  const buildHeaders = (token?: string | null): Record<string, string> => ({
    'Content-Type': 'application/json',
    ...(!skipAuth && token ? { Authorization: `Bearer ${token}` } : {}),
    ...headers,
  });

  const doFetch = async (token?: string | null): Promise<Response> =>
    fetch(`${API_URL}${path}`, {
      method,
      headers: buildHeaders(token),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

  const { accessToken } = useAuthStore.getState();
  let response = await doFetch(accessToken);

  // Token expired — attempt refresh once
  if (response.status === 401 && !skipAuth) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      response = await doFetch(newToken);
    }
  }

  if (!response.ok) {
    let errorBody: ApiError = { statusCode: response.status, message: response.statusText };
    try {
      const json = await response.json() as { data: ApiError };
      errorBody = json.data ?? errorBody;
    } catch {}
    throw new ApiClientError(errorBody.message, response.status, errorBody);
  }

  const json = await response.json() as { data: T };
  return json.data;
}

export const apiClient = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'GET' }),

  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'POST', body }),

  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'PATCH', body }),

  delete: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'DELETE' }),
};

export { ApiClientError };
