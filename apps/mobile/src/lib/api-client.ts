import { useAuthStore } from '../stores/auth.store';
import { env } from './env';

const API_URL = env.API_URL ?? 'http://localhost:3000/api';

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
        // No refresh token means we are in a transitional state (logout in progress).
        // Return null immediately — caller will receive an auth error but no retry loop.
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

  const requestId = Math.random().toString(36).substring(7);
  const startTime = Date.now();

  console.log(`[API REQUEST] [${requestId}]`, {
    method,
    url: `${API_URL}${path}`,
    body,
    headers,
  });

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

  let response: Response;

  try {
    response = await doFetch(accessToken);
  } catch (error) {
    console.log(`[API NETWORK ERROR] [${requestId}]`, error);
    throw error;
  }

  // Token expired — attempt refresh once
  if (response.status === 401 && !skipAuth) {
  console.log(`[API 401] [${requestId}] Token expired, refreshing...`);

  const newToken = await refreshAccessToken();

  if (newToken) {
    console.log(`[API RETRY] [${requestId}] Retrying with new token`);
    response = await doFetch(newToken);
  } else {
    console.log(`[API AUTH FAILED] [${requestId}] Could not refresh token`);
  }
}

  if (!response.ok) {
    let errorBody: ApiError = {
      statusCode: response.status,
      message: response.statusText,
    };

    try {
      const json = await response.json() as { data?: ApiError } & Partial<ApiError>;
      errorBody = json.data ?? (json.message ? (json as ApiError) : errorBody);
    } catch {}

    console.log(`[API ERROR] [${requestId}]`, {
      status: response.status,
      error: errorBody,
    });

    throw new ApiClientError(errorBody.message, response.status, errorBody);
  }

  const json = await response.json() as { data: T };

  console.log(`[API SUCCESS] [${requestId}]`, {
    status: response.status,
    duration: `${Date.now() - startTime}ms`,
    data: json.data,
  });

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