import axios, { AxiosError } from 'axios';

const baseURL = import.meta.env['VITE_API_BASE_URL'] || '';

export const api = axios.create({
  baseURL,
  withCredentials: true,
});

let getToken: () => string | null = () => null;
let onUnauthorized: () => void = () => {};

export function configureApi(opts: {
  getToken: () => string | null;
  onUnauthorized: () => void;
}) {
  getToken = opts.getToken;
  onUnauthorized = opts.onUnauthorized;
}

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err: AxiosError) => {
    if (err.response?.status === 401) {
      onUnauthorized();
    }
    return Promise.reject(err);
  },
);

export function extractErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: unknown } | undefined;
    if (typeof data?.message === 'string') return data.message;
    if (data?.message && typeof data.message === 'object') {
      return JSON.stringify(data.message);
    }
    return err.message;
  }
  return (err as Error)?.message ?? 'Unknown error';
}
