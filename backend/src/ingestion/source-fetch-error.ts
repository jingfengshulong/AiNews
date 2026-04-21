export class SourceFetchError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'SourceFetchError';
    this.category = options.category || 'transient_failure';
    this.retryable = options.retryable !== false;
    this.retryAfter = options.retryAfter;
    this.status = options.status;
  }
}

export function classifyFetchError(error) {
  if (error instanceof SourceFetchError || error?.name === 'SourceFetchError') {
    return {
      message: error.message,
      category: error.category || 'transient_failure',
      retryable: error.retryable !== false,
      retryAfter: error.retryAfter,
      status: error.status
    };
  }

  return {
    message: error?.message || 'Unknown fetch error',
    category: 'transient_failure',
    retryable: true
  };
}

export function sourceFetchErrorFromHttpResponse(sourceName, response) {
  const status = response.status;
  if (status === 429) {
    return new SourceFetchError(`${sourceName} fetch rate limited with status 429`, {
      category: 'rate_limited',
      retryable: true,
      retryAfter: readRetryAfter(response),
      status
    });
  }
  if (status === 401 || status === 403) {
    return new SourceFetchError(`${sourceName} fetch failed with status ${status}`, {
      category: 'configuration_error',
      retryable: false,
      status
    });
  }
  if (status >= 500) {
    return new SourceFetchError(`${sourceName} fetch failed with status ${status}`, {
      category: 'transient_failure',
      retryable: true,
      status
    });
  }
  return new SourceFetchError(`${sourceName} fetch failed with status ${status}`, {
    category: 'permanent_failure',
    retryable: false,
    status
  });
}

function readRetryAfter(response) {
  const value = getHeader(response.headers, 'retry-after');
  if (!value) {
    return undefined;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return new Date(Date.now() + seconds * 1000);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function getHeader(headers, name) {
  if (!headers) {
    return undefined;
  }
  if (typeof headers.get === 'function') {
    return headers.get(name) || headers.get(name.toLowerCase()) || undefined;
  }
  return headers[name] || headers[name.toLowerCase()];
}
