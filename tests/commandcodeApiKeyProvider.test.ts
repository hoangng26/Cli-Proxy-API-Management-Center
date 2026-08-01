import { afterEach, describe, expect, test } from 'bun:test';
import { commandcodeToResource } from '../src/features/providers/adapters';
import { PROVIDER_DESCRIPTORS } from '../src/features/providers/descriptors';
import { apiClient } from '../src/services/api/client';
import { providersApi } from '../src/services/api/providers';
import { normalizeConfigResponse } from '../src/services/api/transformers';

const originalGet = apiClient.get;
const originalPut = apiClient.put;
const originalDelete = apiClient.delete;

afterEach(() => {
  apiClient.get = originalGet;
  apiClient.put = originalPut;
  apiClient.delete = originalDelete;
});

describe('CommandCode API key provider', () => {
  test('normalizes the backend commandcode-api-key contract and exposes a workbench resource', () => {
    const config = normalizeConfigResponse({
      'commandcode-api-key': [
        {
          'api-key': 'user_secret',
          priority: 2,
          prefix: 'cmc',
          'base-url': 'https://api.commandcode.ai',
          'proxy-url': 'http://proxy.local',
          headers: { 'X-Custom': 'value' },
          models: [{ name: 'deepseek/deepseek-v4-flash', alias: 'ds-flash' }],
          'excluded-models': ['stepfun/*'],
          'disable-cooling': true,
          'auth-index': 'commandcode:apikey:1',
        },
      ],
    });

    expect(config.commandcodeApiKeys).toEqual([
      {
        apiKey: 'user_secret',
        priority: 2,
        prefix: 'cmc',
        baseUrl: 'https://api.commandcode.ai',
        proxyUrl: 'http://proxy.local',
        headers: { 'X-Custom': 'value' },
        models: [{ name: 'deepseek/deepseek-v4-flash', alias: 'ds-flash' }],
        excludedModels: ['stepfun/*'],
        disableCooling: true,
        authIndex: 'commandcode:apikey:1',
      },
    ]);

    const resource = commandcodeToResource(config.commandcodeApiKeys![0], 0);
    expect(resource.brand).toBe('commandcode');
    expect(resource.baseUrl).toBe('https://api.commandcode.ai');
    expect(resource.models).toEqual(['deepseek/deepseek-v4-flash']);
    expect(resource.flags.websockets).toBeUndefined();
    expect(resource.selector).toEqual({
      brand: 'commandcode',
      apiKey: 'user_secret',
      baseUrl: 'https://api.commandcode.ai',
      index: 0,
    });
    expect(PROVIDER_DESCRIPTORS.commandcode.baseUrlRequired).toBe(false);
    expect(PROVIDER_DESCRIPTORS.commandcode.supportsWebsockets).toBe(false);
  });

  test('creates and deletes CommandCode keys through the backend management contract', async () => {
    const calls: Array<{ method: string; url: string; data?: unknown }> = [];
    apiClient.get = (async (url: string) => {
      calls.push({ method: 'GET', url });
      return {
        'commandcode-api-key': [
          {
            'api-key': 'existing',
            'base-url': 'https://api.commandcode.ai',
            'future-field': 'preserved',
          },
        ],
      };
    }) as typeof apiClient.get;
    apiClient.put = (async (url: string, data?: unknown) => {
      calls.push({ method: 'PUT', url, data });
      return undefined;
    }) as typeof apiClient.put;
    apiClient.delete = (async (url: string) => {
      calls.push({ method: 'DELETE', url });
      return undefined;
    }) as typeof apiClient.delete;

    await providersApi.createCommandCodeConfig({
      apiKey: 'user_new',
      priority: 1,
      prefix: 'cmc',
      baseUrl: 'https://api.commandcode.ai',
      proxyUrl: 'direct',
      headers: { 'X-Custom': 'value' },
      models: [
        {
          name: 'deepseek/deepseek-v4-pro',
          alias: 'ds-pro',
        },
      ],
      excludedModels: ['stepfun/*'],
      disableCooling: true,
    });
    await providersApi.deleteCommandCodeConfig('user_new', 'https://api.commandcode.ai');

    expect(calls).toEqual([
      { method: 'GET', url: '/config' },
      {
        method: 'PUT',
        url: '/commandcode-api-key',
        data: [
          {
            'api-key': 'existing',
            'base-url': 'https://api.commandcode.ai',
            'future-field': 'preserved',
          },
          {
            'api-key': 'user_new',
            priority: 1,
            prefix: 'cmc',
            'base-url': 'https://api.commandcode.ai',
            'proxy-url': 'direct',
            headers: { 'X-Custom': 'value' },
            models: [
              {
                name: 'deepseek/deepseek-v4-pro',
                alias: 'ds-pro',
              },
            ],
            'excluded-models': ['stepfun/*'],
            'disable-cooling': true,
          },
        ],
      },
      {
        method: 'DELETE',
        url: '/commandcode-api-key?api-key=user_new&base-url=https%3A%2F%2Fapi.commandcode.ai',
      },
    ]);
  });
});
