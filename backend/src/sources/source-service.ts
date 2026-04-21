const sourceTypes = new Set(['rss', 'atom', 'newsapi', 'arxiv', 'semantic_scholar', 'hacker_news', 'product_hunt', 'crossref']);
const families = new Set(['technology_media', 'research', 'funding', 'policy', 'community', 'product_launch', 'company_announcement']);
const credentialRequired = new Set(['newsapi', 'product_hunt']);

export class SourceService {
  constructor(repository) {
    this.repository = repository;
  }

  createSource(input) {
    validateSourceInput(input);
    const now = new Date().toISOString();
    const source = {
      id: this.repository.nextId(),
      name: input.name.trim(),
      sourceType: input.sourceType,
      family: input.family,
      feedUrl: input.feedUrl,
      apiEndpoint: input.apiEndpoint,
      query: input.query,
      fetchLimit: input.fetchLimit,
      language: input.language,
      fetchIntervalMinutes: input.fetchIntervalMinutes,
      trustScore: input.trustScore,
      credentialRef: input.credentialRef,
      usagePolicy: { ...input.usagePolicy },
      enabled: input.enabled !== false,
      nextFetchAt: input.nextFetchAt || now,
      health: {
        lastSuccessfulAt: undefined,
        lastFailureAt: undefined,
        failureCount: 0,
        lastErrorCategory: undefined
      },
      createdAt: now,
      updatedAt: now
    };

    return this.repository.create(source);
  }

  getSource(id) {
    const source = this.repository.get(id);
    if (!source) {
      throw new Error(`Source not found: ${id}`);
    }
    return source;
  }

  listSources() {
    return this.repository.list();
  }

  listEnabledSources() {
    return this.repository.list().filter((source) => source.enabled);
  }

  listDueSources(now = new Date()) {
    const currentTime = now.getTime();
    return this.listEnabledSources().filter((source) => {
      if (!source.nextFetchAt) {
        return true;
      }
      return new Date(source.nextFetchAt).getTime() <= currentTime;
    });
  }

  updateSource(id, patch) {
    return this.repository.update(id, (source) => {
      const candidate = { ...source, ...patch, updatedAt: new Date().toISOString() };
      validateSourceInput(candidate);
      return candidate;
    });
  }

  enableSource(id) {
    return this.repository.update(id, (source) => ({
      ...source,
      enabled: true,
      updatedAt: new Date().toISOString()
    }));
  }

  disableSource(id) {
    return this.repository.update(id, (source) => ({
      ...source,
      enabled: false,
      updatedAt: new Date().toISOString()
    }));
  }

  updateHealth(id, result) {
    return this.repository.update(id, (source) => {
      const at = toIso(result.at || new Date());
      const health = { ...source.health };
      if (result.ok) {
        health.lastSuccessfulAt = at;
        health.failureCount = 0;
        health.lastErrorCategory = undefined;
      } else {
        health.lastFailureAt = at;
        health.failureCount = (health.failureCount || 0) + 1;
        health.lastErrorCategory = result.errorCategory || 'unknown';
      }

      return {
        ...source,
        health,
        updatedAt: new Date().toISOString()
      };
    });
  }

  markFetchScheduled(id, nextFetchAt) {
    return this.repository.update(id, (source) => ({
      ...source,
      nextFetchAt: toIso(nextFetchAt),
      updatedAt: new Date().toISOString()
    }));
  }
}

export function validateSourceInput(input) {
  if (!input.name || !input.name.trim()) {
    throw new Error('Source name is required');
  }
  if (!sourceTypes.has(input.sourceType)) {
    throw new Error(`Unsupported source type: ${input.sourceType}`);
  }
  if (!families.has(input.family)) {
    throw new Error(`Unsupported source family: ${input.family}`);
  }
  if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(input.language)) {
    throw new Error('Source language must be an ISO language code such as en or zh-CN');
  }
  if (!Number.isInteger(input.fetchIntervalMinutes) || input.fetchIntervalMinutes < 5) {
    throw new Error('Source fetch interval must be an integer of at least 5 minutes');
  }
  if (typeof input.trustScore !== 'number' || input.trustScore < 0 || input.trustScore > 1) {
    throw new Error('Source trust score must be between 0 and 1');
  }
  if ((input.sourceType === 'rss' || input.sourceType === 'atom') && !input.feedUrl) {
    throw new Error('RSS and Atom sources require a feed URL');
  }
  if (credentialRequired.has(input.sourceType) && !input.credentialRef) {
    throw new Error(`${input.sourceType} sources require a credential reference`);
  }
  validateUsagePolicy(input.usagePolicy);
}

function validateUsagePolicy(policy) {
  const keys = ['allowFullText', 'allowSummary', 'commercialUseNeedsReview', 'attributionRequired'];
  if (!policy || typeof policy !== 'object') {
    throw new Error('Source usage policy is required');
  }
  for (const key of keys) {
    if (typeof policy[key] !== 'boolean') {
      throw new Error(`Source usage policy requires boolean ${key}`);
    }
  }
}

function toIso(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
