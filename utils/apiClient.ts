import { APIRequestContext } from '@playwright/test';

/**
 * Thin wrapper around Playwright's request context for the API suite.
 */
export class ApiClient {
  constructor(private request: APIRequestContext, private baseUrl: string) {}

  async get(path: string, headers: Record<string, string> = {}) {
    return this.request.get(`${this.baseUrl}${path}`, { headers });
  }

  async post(path: string, data: unknown, headers: Record<string, string> = {}) {
    return this.request.post(`${this.baseUrl}${path}`, { data, headers });
  }

  async put(path: string, data: unknown, headers: Record<string, string> = {}) {
    return this.request.put(`${this.baseUrl}${path}`, { data, headers });
  }

  async delete(path: string, headers: Record<string, string> = {}) {
    return this.request.delete(`${this.baseUrl}${path}`, { headers });
  }
}
