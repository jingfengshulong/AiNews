export class InMemoryStore {
  constructor() {
    this.sources = new Map();
    this.rawItems = new Map();
    this.rawItemIndex = new Map();
    this.articles = new Map();
    this.articleIndex = new Map();
    this.sourceRelations = new Map();
    this.sourceRelationIndex = new Map();
    this.signals = new Map();
    this.signalArticles = new Map();
    this.signalArticleIndex = new Map();
    this.topics = new Map();
    this.topicIndex = new Map();
    this.signalTopics = new Map();
    this.signalTopicIndex = new Map();
    this.scoreComponents = new Map();
    this.scoreComponentIndex = new Map();
    this.jobs = new Map([
      ['fetch', new Map()],
      ['process', new Map()],
      ['enrichment', new Map()]
    ]);
    this.jobKeyIndex = new Map([
      ['fetch', new Map()],
      ['process', new Map()],
      ['enrichment', new Map()]
    ]);
    this.counters = new Map();
  }

  nextId(prefix) {
    const next = (this.counters.get(prefix) || 0) + 1;
    this.counters.set(prefix, next);
    return `${prefix}_${String(next).padStart(4, '0')}`;
  }
}

export function cloneRecord(value) {
  return value === undefined ? undefined : structuredClone(value);
}
