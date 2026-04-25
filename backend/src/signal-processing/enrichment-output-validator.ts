export class EnrichmentValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EnrichmentValidationError';
    this.category = 'enrichment_validation_failed';
  }
}

export function validateEnrichmentOutput(output, context) {
  const normalized = normalizeOutput(output);
  const errors = [];

  if (!hasCjk(normalized.aiBrief)) {
    errors.push('User-facing enrichment text must use Simplified Chinese');
  }
  if (wordCount(normalized.aiBrief) > 90 || visibleLength(normalized.aiBrief) > 220) {
    errors.push('AI brief is too long');
  }
  if (normalized.keyPoints.length === 0 || normalized.keyPoints.length > 6) {
    errors.push('Key points must include 1 to 6 items');
  }
  if (normalized.timeline.length > 8) {
    errors.push('Timeline must include at most 8 items');
  }
  if (!normalized.sourceMix.length) {
    errors.push('Source mix is required for attribution');
  }
  if (!hasCjk(normalized.nextWatch)) {
    errors.push('Next-watch text must use Simplified Chinese');
  }
  if (wordCount(normalized.nextWatch) > 60 || visibleLength(normalized.nextWatch) > 140) {
    errors.push('Next-watch text is too long');
  }

  const sourceIds = new Set(context.sources.map((source) => source.id));
  for (const point of normalized.keyPoints) {
    if (!hasCjk(point.text)) {
      errors.push('Key points must use Simplified Chinese');
    }
    if (wordCount(point.text) > 45 || visibleLength(point.text) > 100) {
      errors.push('Key point is too long');
    }
    if (!point.sourceIds.length || point.sourceIds.some((sourceId) => !sourceIds.has(sourceId))) {
      errors.push('Key points require valid source references');
    }
  }
  for (const item of normalized.timeline) {
    if (!hasCjk(item.label)) {
      errors.push('Timeline items must use Simplified Chinese');
    }
    if (wordCount(item.label) > 45 || visibleLength(item.label) > 100) {
      errors.push('Timeline item is too long');
    }
    if (!item.sourceIds.length || item.sourceIds.some((sourceId) => !sourceIds.has(sourceId))) {
      errors.push('Timeline items require valid source references');
    }
  }
  for (const item of normalized.sourceMix) {
    if (!sourceIds.has(item.sourceId)) {
      errors.push('Source mix includes unknown source references');
    }
  }

  const copiedMatch = copiedRestrictedTextMatch(normalized, context);
  if (copiedMatch) {
    errors.push(`Output appears to include copied restricted source text from ${copiedMatch.sourceName}`);
  }

  if (errors.length > 0) {
    throw new EnrichmentValidationError(unique(errors).join('; '));
  }

  return normalized;
}

function normalizeOutput(output = {}) {
  return {
    aiBrief: cleanText(output.aiBrief),
    keyPoints: asArray(output.keyPoints).map((point) => ({
      text: cleanText(typeof point === 'string' ? point : point.text),
      sourceIds: asArray(point?.sourceIds).filter(Boolean)
    })).filter((point) => point.text),
    timeline: asArray(output.timeline).map((item) => ({
      label: cleanText(typeof item === 'string' ? item : item.label),
      at: item?.at,
      sourceIds: asArray(item?.sourceIds).filter(Boolean)
    })).filter((item) => item.label),
    sourceMix: asArray(output.sourceMix).map((item) => ({
      sourceId: item?.sourceId,
      sourceName: cleanText(item?.sourceName),
      role: cleanText(item?.role) || 'supporting'
    })).filter((item) => item.sourceId),
    nextWatch: cleanText(output.nextWatch),
    relatedSignalIds: asArray(output.relatedSignalIds).filter(Boolean)
  };
}

function copiedRestrictedTextMatch(output, context) {
  const outputText = normalizedText([
    output.aiBrief,
    output.nextWatch,
    ...output.keyPoints.map((point) => point.text),
    ...output.timeline.map((item) => item.label)
  ].join(' '));

  for (const article of context.articles) {
    const source = context.sources.find((candidate) => candidate.id === article.sourceId);
    if (!source || source.usagePolicy?.allowFullText === true || article.fullTextDisplayAllowed === true) {
      continue;
    }
    const sourceText = normalizedText(article.textForAI || '');
    const wordWindows = tokenWindows(sourceText.split(' '), 12);
    const cjkWindows = characterWindows(sourceText.replace(/\s+/g, ''), 24);
    const compactOutput = outputText.replace(/\s+/g, '');
    if (wordWindows.some((window) => outputText.includes(window)) || cjkWindows.some((window) => compactOutput.includes(window))) {
      return {
        sourceName: source.name
      };
    }
  }

  return undefined;
}

function tokenWindows(tokens, size) {
  if (tokens.length < size) {
    return [];
  }
  const windows = [];
  for (let index = 0; index <= tokens.length - size; index += 1) {
    windows.push(tokens.slice(index, index + size).join(' '));
  }
  return windows;
}

function characterWindows(value, size) {
  if (!hasCjk(value)) {
    return [];
  }
  const chars = Array.from(value);
  if (chars.length < size) {
    return [];
  }
  const windows = [];
  for (let index = 0; index <= chars.length - size; index += 1) {
    windows.push(chars.slice(index, index + size).join(''));
  }
  return windows;
}

function normalizedText(value) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function visibleLength(value) {
  return Array.from(cleanText(value)).length;
}

function hasCjk(value) {
  return /[\u4e00-\u9fff]/.test(String(value || ''));
}

function wordCount(value) {
  return cleanText(value).split(/\s+/).filter(Boolean).length;
}

function asArray(value) {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function unique(values) {
  return Array.from(new Set(values));
}
