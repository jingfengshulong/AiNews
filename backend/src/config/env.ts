import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const runtimeModes = new Set(['development', 'test', 'production']);

export function loadConfig(env = process.env) {
  const runtimeMode = env.RUNTIME_MODE || env.NODE_ENV || 'development';
  if (!runtimeModes.has(runtimeMode)) {
    throw new Error(`Unsupported runtime mode: ${runtimeMode}`);
  }

  return {
    runtimeMode,
    databaseUrl: env.DATABASE_URL || 'postgres://news:news@localhost:5432/ai_news',
    redisUrl: env.REDIS_URL || 'redis://localhost:6379/0',
    sourceSecretRefs: {
      newsapi: 'NEWSAPI_KEY',
      productHunt: 'PRODUCT_HUNT_TOKEN',
      semanticScholar: 'SEMANTIC_SCHOLAR_API_KEY',
      crossrefContactEmail: 'CROSSREF_CONTACT_EMAIL'
    },
    enrichmentSecretRef: 'AI_ENRICHMENT_API_KEY',
    enrichment: {
      model: env.AI_ENRICHMENT_MODEL || 'mock-enrichment',
      baseUrl: env.AI_ENRICHMENT_BASE_URL
    },
    crossrefContactEmail: env.CROSSREF_CONTACT_EMAIL,
    secrets: {
      newsapi: env.NEWSAPI_KEY,
      productHunt: env.PRODUCT_HUNT_TOKEN,
      semanticScholar: env.SEMANTIC_SCHOLAR_API_KEY,
      enrichment: env.AI_ENRICHMENT_API_KEY
    }
  };
}

export async function loadConfigFromEnvFile({ envPath = '.env', baseEnv = process.env } = {}) {
  const fileEnv = await readDotEnvFile(envPath);
  return loadConfig({
    ...fileEnv,
    ...baseEnv
  });
}

export async function readDotEnvFile(envPath = '.env') {
  try {
    const content = await readFile(resolve(envPath), 'utf8');
    return parseDotEnv(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

export function parseDotEnv(content) {
  const values = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separator = line.indexOf('=');
    if (separator === -1) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }

    values[key] = parseDotEnvValue(line.slice(separator + 1).trim());
  }

  return values;
}

export function redactConfig(config) {
  return {
    runtimeMode: config.runtimeMode,
    databaseUrl: redactUrl(config.databaseUrl),
    redisUrl: redactUrl(config.redisUrl),
    sourceSecretRefs: { ...config.sourceSecretRefs },
    enrichmentSecretRef: config.enrichmentSecretRef,
    enrichment: { ...config.enrichment },
    crossrefContactEmail: config.crossrefContactEmail,
    secrets: {
      newsapi: config.secrets.newsapi ? '[redacted]' : undefined,
      productHunt: config.secrets.productHunt ? '[redacted]' : undefined,
      semanticScholar: config.secrets.semanticScholar ? '[redacted]' : undefined,
      enrichment: config.secrets.enrichment ? '[redacted]' : undefined
    }
  };
}

function parseDotEnvValue(value) {
  if (!value) {
    return '';
  }

  const quote = value[0];
  if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
    return value.slice(1, -1).replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t');
  }

  return stripInlineComment(value).trim();
}

function stripInlineComment(value) {
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
    }
    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
    }
    if (char === '#' && !inSingleQuote && !inDoubleQuote && /\s/.test(value[index - 1] || ' ')) {
      return value.slice(0, index);
    }
  }

  return value;
}

function redactUrl(value) {
  return value.replace(/:\/\/([^:@/]+):([^@/]+)@/, '://$1:[redacted]@');
}
