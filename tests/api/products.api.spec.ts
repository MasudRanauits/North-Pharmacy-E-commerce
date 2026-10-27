import { test, expect } from '@playwright/test';
import { ApiClient } from '../../utils/apiClient';
import { BASE_URL } from '../../data/testData';

test.describe('Products API', { tag: '@api' }, () => {
  test.skip(true, 'Enable once the API endpoints are confirmed.');

  test('GET /api/products returns 200', async ({ request }) => {
    const api = new ApiClient(request, BASE_URL);
    const response = await api.get('/api/products');

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBeTruthy();
  });
});
