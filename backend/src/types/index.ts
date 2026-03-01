export interface ApiResponse<T = unknown> {
  statusCode: number;
  body: T;
}

export interface ErrorResponse {
  message: string;
  error?: string;
}

export type ServiceResult<T> =
  | { data: T; cached: true; cachedAt: string; fetchedAt?: never }
  | { data: T; cached: false; cachedAt?: never; fetchedAt: string };

export interface CachedItem<T> {
  pk: string;
  sk: string;
  data: T;
  timestamp: number;
  ttl: number;
}
