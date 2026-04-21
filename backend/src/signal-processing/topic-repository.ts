import { cloneRecord } from '../db/in-memory-store.ts';

export const defaultTopics = [
  {
    slug: 'ai-agent',
    name: 'AI Agent',
    description: 'Agentic systems, tool use, autonomous workflows, and agent platforms.'
  },
  {
    slug: 'large-model-products',
    name: 'Large Model Products',
    description: 'Model releases, LLM products, developer APIs, and productized foundation model capabilities.'
  },
  {
    slug: 'ai-video',
    name: 'AI Video',
    description: 'Text-to-video, image-to-video, video editing, and multimodal video generation.'
  },
  {
    slug: 'edge-models',
    name: 'Edge Models',
    description: 'On-device inference, edge AI deployment, NPUs, mobile models, and compact local models.'
  },
  {
    slug: 'policy',
    name: 'Policy',
    description: 'Regulation, governance, safety policy, compliance, copyright, and public-sector AI rules.'
  },
  {
    slug: 'research',
    name: 'Research',
    description: 'Papers, benchmarks, datasets, evaluations, and academic or lab research updates.'
  },
  {
    slug: 'funding',
    name: 'Funding',
    description: 'Fundraises, investments, valuations, acquisitions, and startup financing.'
  },
  {
    slug: 'company-announcements',
    name: 'Company Announcements',
    description: 'Official company news, release notes, launch posts, and corporate announcements.'
  }
];

export class TopicRepository {
  constructor(store) {
    this.store = store;
  }

  seedDefaultTopics() {
    return defaultTopics.map((topic) => this.upsertTopic(topic));
  }

  upsertTopic(input) {
    validateTopic(input);
    const existingId = this.store.topicIndex.get(input.slug);
    if (existingId) {
      const existing = this.store.topics.get(existingId);
      const updated = {
        ...existing,
        name: input.name,
        description: input.description
      };
      this.store.topics.set(existingId, updated);
      return cloneRecord(updated);
    }

    const topic = {
      id: this.store.nextId('topic'),
      slug: input.slug,
      name: input.name,
      description: input.description
    };
    this.store.topics.set(topic.id, topic);
    this.store.topicIndex.set(topic.slug, topic.id);
    return cloneRecord(topic);
  }

  getTopicBySlug(slug) {
    const id = this.store.topicIndex.get(slug);
    return id ? cloneRecord(this.store.topics.get(id)) : undefined;
  }

  listTopics() {
    return Array.from(this.store.topics.values()).map(cloneRecord);
  }

  upsertSignalTopic(input) {
    validateSignalTopic(input);
    const topic = this.getTopicBySlug(input.topicSlug);
    if (!topic) {
      throw new Error(`Topic not found: ${input.topicSlug}`);
    }

    const key = `${input.signalId}:${topic.id}`;
    const existingId = this.store.signalTopicIndex.get(key);
    const now = new Date().toISOString();
    if (existingId) {
      const existing = this.store.signalTopics.get(existingId);
      const updated = {
        ...existing,
        method: input.method,
        confidence: input.confidence,
        reason: input.reason,
        evidence: cloneRecord(input.evidence || {}),
        updatedAt: now
      };
      this.store.signalTopics.set(existingId, updated);
      return cloneRecord(updated);
    }

    const assignment = {
      id: this.store.nextId('sigtopic'),
      signalId: input.signalId,
      topicId: topic.id,
      topicSlug: topic.slug,
      method: input.method,
      confidence: input.confidence,
      reason: input.reason,
      evidence: cloneRecord(input.evidence || {}),
      createdAt: now,
      updatedAt: now
    };
    this.store.signalTopics.set(assignment.id, assignment);
    this.store.signalTopicIndex.set(key, assignment.id);
    return cloneRecord(assignment);
  }

  listSignalTopics(signalId) {
    return Array.from(this.store.signalTopics.values())
      .filter((assignment) => !signalId || assignment.signalId === signalId)
      .map(cloneRecord);
  }
}

function validateTopic(input) {
  if (!input.slug) {
    throw new Error('Topic requires slug');
  }
  if (!input.name) {
    throw new Error('Topic requires name');
  }
}

function validateSignalTopic(input) {
  if (!input.signalId) {
    throw new Error('Signal topic requires signal id');
  }
  if (!input.topicSlug) {
    throw new Error('Signal topic requires topic slug');
  }
  if (!input.method) {
    throw new Error('Signal topic requires method');
  }
  if (typeof input.confidence !== 'number' || input.confidence < 0 || input.confidence > 1) {
    throw new Error('Signal topic confidence must be between 0 and 1');
  }
  if (!input.reason) {
    throw new Error('Signal topic requires reason');
  }
}
