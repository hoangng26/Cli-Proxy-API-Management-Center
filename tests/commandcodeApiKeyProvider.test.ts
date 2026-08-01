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
  test('normalizes named blocks with api-key-entries and exposes a workbench resource', () => {
    const config = normalizeConfigResponse({
      'commandcode-api-key': [
        {
          name: 'primary',
          'base-url': 'https://api.commandcode.ai',
          'api-key-entries': [
            {
              'api-key': 'user_secret',
              weight: 1,
              'proxy-url': 'http://proxy.local',
            },
          ],
          priority: 2,
          prefix: 'cmc',
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
        name: 'primary',
        baseUrl: 'https://api.commandcode.ai',
        apiKeyEntries: [
          {
            apiKey: 'user_secret',
            weight: 1,
            proxyUrl: 'http://proxy.local',
          },
        ],
        priority: 2,
        prefix: 'cmc',
        headers: { 'X-Custom': 'value' },
        models: [{ name: 'deepseek/deepseek-v4-flash', alias: 'ds-flash' }],
        excludedModels: ['stepfun/*'],
        disableCooling: true,
        authIndex: 'commandcode:apikey:1',
        sourceIndex: 0,
      },
    ]);

    const resource = commandcodeToResource(config.commandcodeApiKeys![0], 0);
    expect(resource.brand).toBe('commandcode');
    expect(resource.name).toBe('primary');
    expect(resource.baseUrl).toBe('https://api.commandcode.ai');
    expect(resource.models).toEqual(['deepseek/deepseek-v4-flash']);
    expect(resource.apiKeyEntryCount).toBe(1);
    expect(resource.flags.websockets).toBeUndefined();
    expect(resource.selector).toEqual({
      brand: 'commandcode',
      name: 'primary',
      index: 0,
    });
    expect(PROVIDER_DESCRIPTORS.commandcode.supportsName).toBe(true);
    expect(PROVIDER_DESCRIPTORS.commandcode.supportsApiKey).toBe(false);
    expect(PROVIDER_DESCRIPTORS.commandcode.supportsApiKeyEntries).toBe(true);
    expect(PROVIDER_DESCRIPTORS.commandcode.supportsProxyUrl).toBe(false);
    expect(PROVIDER_DESCRIPTORS.commandcode.baseUrlRequired).toBe(false);
    expect(PROVIDER_DESCRIPTORS.commandcode.supportsWebsockets).toBe(false);
    expect(PROVIDER_DESCRIPTORS.commandcode.sheetSize).toBe('lg');
  });

  test('creates and deletes CommandCode named blocks through the backend management contract', async () => {
    const calls: Array<{ method: string; url: string; data?: unknown }> = [];
    apiClient.get = (async (url: string) => {
      calls.push({ method: 'GET', url });
      return {
        'commandcode-api-key': [
          {
            name: 'existing',
            'base-url': 'https://api.commandcode.ai',
            'api-key-entries': [{ 'api-key': 'existing_key', weight: 1 }],
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
      name: 'primary',
      priority: 1,
      prefix: 'cmc',
      baseUrl: 'https://api.commandcode.ai',
      apiKeyEntries: [
        {
          apiKey: 'user_new',
          weight: 1,
          proxyUrl: 'direct',
        },
      ],
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
    await providersApi.deleteCommandCodeConfig('primary');

    expect(calls).toEqual([
      { method: 'GET', url: '/config' },
      {
        method: 'PUT',
        url: '/commandcode-api-key',
        data: [
          {
            name: 'existing',
            'base-url': 'https://api.commandcode.ai',
            'api-key-entries': [{ 'api-key': 'existing_key', weight: 1 }],
            'future-field': 'preserved',
          },
          {
            name: 'primary',
            priority: 1,
            prefix: 'cmc',
            'base-url': 'https://api.commandcode.ai',
            'api-key-entries': [
              {
                'api-key': 'user_new',
                weight: 1,
                'proxy-url': 'direct',
              },
            ],
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
        url: '/commandcode-api-key?name=primary',
      },
    ]);
  });
});
