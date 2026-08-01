import type { ApiKeyEntry } from '@/types';
import {
  buildRecentRequestCompositeKey,
  mergeRecentRequestBucketGroups,
  statusBarDataFromRecentRequests,
  sumRecentRequests,
  type RecentRequestBucket,
  type RecentRequestUsageEntry,
  type StatusBarData,
} from '@/utils/recentRequests';

interface NamedMultiKeyProvider {
  name: string;
  baseUrl?: string;
  apiKeyEntries?: ApiKeyEntry[];
}

const DISABLE_ALL_MODELS_RULE = '*';
const DEFAULT_GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com';

export const hasDisableAllModelsRule = (models?: string[]) =>
  Array.isArray(models) &&
  models.some((model) => String(model ?? '').trim() === DISABLE_ALL_MODELS_RULE);

export const stripDisableAllModelsRule = (models?: string[]) =>
  Array.isArray(models)
    ? models.filter((model) => String(model ?? '').trim() !== DISABLE_ALL_MODELS_RULE)
    : [];

export const withDisableAllModelsRule = (models?: string[]) => {
  const base = stripDisableAllModelsRule(models);
  return [...base, DISABLE_ALL_MODELS_RULE];
};

export const withoutDisableAllModelsRule = (models?: string[]) => stripDisableAllModelsRule(models);

const normalizeUpstreamBaseUrl = (baseUrl: string, fallback = ''): string => {
  let trimmed = String(baseUrl || '').trim();
  if (!trimmed) return fallback;
  trimmed = trimmed.replace(/\/?v0\/management\/?$/i, '');
  trimmed = trimmed.replace(/\/+$/g, '');
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `http://${trimmed}`;
  }
  return trimmed;
};

const buildGeminiModelResource = (model: string): string => {
  const trimmed = String(model || '')
    .trim()
    .replace(/^\/+/g, '')
    .replace(/:generateContent$/i, '');
  if (!trimmed) return '';

  if (/^(models|tunedModels)\//i.test(trimmed)) {
    return trimmed.split('/').map(encodeURIComponent).join('/');
  }

  return `models/${encodeURIComponent(trimmed)}`;
};

export const buildOpenAIChatCompletionsEndpoint = (baseUrl: string): string => {
  const trimmed = normalizeUpstreamBaseUrl(baseUrl);
  if (!trimmed) return '';
  if (trimmed.endsWith('/chat/completions')) {
    return trimmed;
  }
  return `${trimmed}/chat/completions`;
};

const COMMANDCODE_DEFAULT_BASE_URL = 'https://api.commandcode.ai';

export const buildCommandCodeModelsEndpoint = (baseUrl: string): string => {
  const trimmed = normalizeUpstreamBaseUrl(baseUrl || COMMANDCODE_DEFAULT_BASE_URL);
  if (!trimmed) return '';
  let root = trimmed.replace(/\/+$/g, '');
  if (root.endsWith('/provider/v1/models')) {
    return root;
  }
  if (root.endsWith('/provider/v1')) {
    return `${root}/models`;
  }
  root = root.replace(/\/provider\/v1(?:\/.*)?$/i, '');
  root = root.replace(/\/v1(?:\/.*)?$/i, '');
  root = root.replace(/\/alpha(?:\/.*)?$/i, '');
  return `${root}/provider/v1/models`;
};

export const buildCommandCodeGenerateEndpoint = (baseUrl: string): string => {
  const trimmed = normalizeUpstreamBaseUrl(baseUrl || COMMANDCODE_DEFAULT_BASE_URL);
  if (!trimmed) return '';
  let root = trimmed.replace(/\/+$/g, '');
  if (root.endsWith('/alpha/generate')) {
    return root;
  }
  if (root.endsWith('/alpha')) {
    return `${root}/generate`;
  }
  root = root.replace(/\/provider\/v1(?:\/.*)?$/i, '');
  root = root.replace(/\/v1(?:\/.*)?$/i, '');
  root = root.replace(/\/alpha(?:\/.*)?$/i, '');
  return `${root}/alpha/generate`;
};

const COMMANDCODE_VERSION_HEADER = '0.25.7';

export const buildCommandCodeGenerateProbeBody = (model: string): string => {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const payload = {
    threadId: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    memory: '',
    config: {
      workingDir: '',
      date,
      environment: 'cli',
      structure: [],
      isGitRepo: false,
      currentBranch: '',
      mainBranch: '',
      gitStatus: '',
      recentCommits: [],
    },
    params: {
      model,
      stream: true,
      max_tokens: 16,
      temperature: 0.3,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }],
    },
  };
  return JSON.stringify(payload);
};

export const buildCommandCodeFixedHeaders = (): Record<string, string> => ({
  'x-session-id': crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  'x-command-code-version': COMMANDCODE_VERSION_HEADER,
  'x-cli-environment': 'cli',
});

export const buildCodexResponsesEndpoint = (baseUrl: string): string => {
  const trimmed = normalizeUpstreamBaseUrl(baseUrl);
  if (!trimmed) return '';
  if (/\/v1\/responses$/i.test(trimmed)) {
    return trimmed;
  }
  if (/\/v1\/models$/i.test(trimmed)) {
    return trimmed.replace(/\/models$/i, '/responses');
  }
  if (/\/v1$/i.test(trimmed)) {
    return `${trimmed}/responses`;
  }
  return `${trimmed}/v1/responses`;
};

export const buildClaudeMessagesEndpoint = (baseUrl: string): string => {
  const trimmed = normalizeUpstreamBaseUrl(baseUrl, 'https://api.anthropic.com');
  if (!trimmed) return '';
  if (trimmed.endsWith('/v1/messages')) {
    return trimmed;
  }
  if (trimmed.endsWith('/v1')) {
    return `${trimmed}/messages`;
  }
  return `${trimmed}/v1/messages`;
};

export const INTERACTIONS_API_REVISION = '2026-05-20';

export const buildInteractionsProbePayload = (model: string) => ({
  model,
  input: 'Hi',
});

export const buildInteractionsEndpoint = (baseUrl: string): string => {
  const trimmed = normalizeUpstreamBaseUrl(baseUrl, DEFAULT_GEMINI_BASE_URL);
  if (!trimmed) return '';
  if (/\/v1beta\/interactions$/i.test(trimmed)) {
    return trimmed;
  }

  let root = trimmed.replace(/\/+$/g, '');
  root = root.replace(/\/v1beta\/models$/i, '');
  if (/\/v1beta$/i.test(root)) {
    return `${root}/interactions`;
  }
  root = root.replace(/\/v1beta(?:\/.*)?$/i, '');
  return `${root}/v1beta/interactions`;
};

export const buildGeminiGenerateContentEndpoint = (baseUrl: string, model: string): string => {
  const resource = buildGeminiModelResource(model);
  if (!resource) return '';

  const trimmed = normalizeUpstreamBaseUrl(baseUrl, DEFAULT_GEMINI_BASE_URL);
  if (!trimmed) return '';
  if (/:generateContent$/i.test(trimmed)) {
    return trimmed;
  }

  let root = trimmed.replace(/\/+$/g, '');
  if (/\/v1beta\/models$/i.test(root)) {
    root = root.replace(/\/models$/i, '');
  } else if (!/\/v1beta$/i.test(root)) {
    root = root.replace(/\/v1beta(?:\/.*)?$/i, '');
    root = `${root}/v1beta`;
  }

  return `${root}/${resource}:generateContent`;
};

export const getProviderUsageKey = (provider: string): string => {
  if (provider === 'claudeApi') return 'claude';
  if (provider === 'interactions') return 'gemini-interactions';
  return provider;
};

export type ProviderRecentUsageMap = Map<string, Map<string, RecentRequestUsageEntry>>;

const EMPTY_RECENT_USAGE_ENTRY: RecentRequestUsageEntry = {
  success: 0,
  failed: 0,
  recentRequests: [],
};

const normalizeProviderRecentKey = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .toLowerCase();

const getProviderRecentUsageEntry = (
  usageByProvider: ProviderRecentUsageMap,
  provider: string,
  apiKey?: string,
  baseUrl?: string
): RecentRequestUsageEntry => {
  if (!String(apiKey ?? '').trim()) {
    return EMPTY_RECENT_USAGE_ENTRY;
  }

  const providerKey = normalizeProviderRecentKey(provider);
  const compositeKey = buildRecentRequestCompositeKey(baseUrl, apiKey);
  return usageByProvider.get(providerKey)?.get(compositeKey) ?? EMPTY_RECENT_USAGE_ENTRY;
};

const getProviderRecentBuckets = (
  usageByProvider: ProviderRecentUsageMap,
  provider: string,
  apiKey?: string,
  baseUrl?: string
): RecentRequestBucket[] =>
  getProviderRecentUsageEntry(usageByProvider, provider, apiKey, baseUrl).recentRequests;

export function getProviderRecentStatusData(
  usageByProvider: ProviderRecentUsageMap,
  provider: string,
  apiKey?: string,
  baseUrl?: string
): StatusBarData {
  return statusBarDataFromRecentRequests(
    getProviderRecentBuckets(usageByProvider, provider, apiKey, baseUrl)
  );
}

export function getProviderTotalStats(
  usageByProvider: ProviderRecentUsageMap,
  provider: string,
  apiKey?: string,
  baseUrl?: string
): { success: number; failure: number } {
  const entry = getProviderRecentUsageEntry(usageByProvider, provider, apiKey, baseUrl);
  return { success: entry.success, failure: entry.failed };
}

export function getProviderRecentWindowStats(
  usageByProvider: ProviderRecentUsageMap,
  provider: string,
  apiKey?: string,
  baseUrl?: string
): { success: number; failure: number } {
  return sumRecentRequests(getProviderRecentBuckets(usageByProvider, provider, apiKey, baseUrl));
}

const collectNamedMultiKeyRecentBuckets = (
  provider: NamedMultiKeyProvider,
  usageByProvider: ProviderRecentUsageMap
): RecentRequestBucket[] => {
  if (!provider.apiKeyEntries?.length) {
    return [];
  }

  const groups = provider.apiKeyEntries.map((entry) =>
    getProviderRecentBuckets(usageByProvider, provider.name, entry.apiKey, provider.baseUrl)
  );

  return mergeRecentRequestBucketGroups(groups);
};

export function getOpenAIProviderRecentWindowStats(
  provider: NamedMultiKeyProvider,
  usageByProvider: ProviderRecentUsageMap
): { success: number; failure: number } {
  return sumRecentRequests(collectNamedMultiKeyRecentBuckets(provider, usageByProvider));
}

export function getOpenAIProviderTotalStats(
  provider: NamedMultiKeyProvider,
  usageByProvider: ProviderRecentUsageMap
): { success: number; failure: number } {
  return (provider.apiKeyEntries || []).reduce(
    (total, entry) => {
      const usageEntry = getProviderRecentUsageEntry(
        usageByProvider,
        provider.name,
        entry.apiKey,
        provider.baseUrl
      );
      return {
        success: total.success + usageEntry.success,
        failure: total.failure + usageEntry.failed,
      };
    },
    { success: 0, failure: 0 }
  );
}

export function getOpenAIProviderRecentStatusData(
  provider: NamedMultiKeyProvider,
  usageByProvider: ProviderRecentUsageMap
): StatusBarData {
  return statusBarDataFromRecentRequests(
    collectNamedMultiKeyRecentBuckets(provider, usageByProvider)
  );
}
