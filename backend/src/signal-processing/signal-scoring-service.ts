const heatWeights = {
  freshness: 25,
  sourceCount: 15,
  sourceDiversity: 12,
  duplicateSupport: 14,
  communityActivity: 10,
  sourceTrust: 12,
  topicVelocity: 5,
  topicConfidence: 7
};

const signalWeights = {
  sourceTrust: 30,
  evidenceStrength: 20,
  contentQuality: 20,
  topicConfidence: 15,
  duplicateConfidence: 15
};

export class SignalScoringService {
  constructor({
    signalRepository,
    articleRepository,
    sourceService,
    sourceRelationRepository,
    topicRepository,
    scoreComponentRepository,
    now = () => new Date()
  } = {}) {
    this.signalRepository = signalRepository;
    this.articleRepository = articleRepository;
    this.sourceService = sourceService;
    this.sourceRelationRepository = sourceRelationRepository;
    this.topicRepository = topicRepository;
    this.scoreComponentRepository = scoreComponentRepository;
    this.now = now;
  }

  scoreSignals() {
    const signals = this.signalRepository.listSignals();
    const results = signals.map((signal) => this.scoreSignal(signal.id));
    return {
      checkedSignals: signals.length,
      scoredSignals: results.length
    };
  }

  scoreSignal(signalId) {
    const signal = this.signalRepository.getSignal(signalId);
    if (!signal) {
      throw new Error(`Signal not found: ${signalId}`);
    }

    const context = this.contextForSignal(signal);
    const heatComponents = [
      component('heat_freshness', context.freshness, heatWeights.freshness),
      component('heat_source_count', context.sourceCount, heatWeights.sourceCount),
      component('heat_source_diversity', context.sourceDiversity, heatWeights.sourceDiversity),
      component('heat_duplicate_support', context.duplicateSupport, heatWeights.duplicateSupport),
      component('heat_community_activity', context.communityActivity, heatWeights.communityActivity),
      component('heat_source_trust', context.sourceTrust, heatWeights.sourceTrust),
      component('heat_topic_velocity', context.topicVelocity, heatWeights.topicVelocity),
      component('heat_topic_confidence', context.topicConfidence, heatWeights.topicConfidence)
    ];
    const signalComponents = [
      component('signal_source_trust', context.sourceTrust, signalWeights.sourceTrust),
      component('signal_evidence_strength', context.evidenceStrength, signalWeights.evidenceStrength),
      component('signal_content_quality', context.contentQuality, signalWeights.contentQuality),
      component('signal_topic_confidence', context.topicConfidence, signalWeights.topicConfidence),
      component('signal_duplicate_confidence', context.duplicateConfidence, signalWeights.duplicateConfidence)
    ];

    for (const scoreComponent of [...heatComponents, ...signalComponents]) {
      this.scoreComponentRepository.upsertScoreComponent({
        signalId: signal.id,
        ...scoreComponent
      });
    }

    const heatScore = scoreSum(heatComponents);
    const signalScore = scoreSum(signalComponents);
    const updated = this.signalRepository.updateScores(signal.id, {
      heatScore,
      signalScore
    });

    return {
      signalId: signal.id,
      heatScore: updated.heatScore,
      signalScore: updated.signalScore,
      components: [...heatComponents, ...signalComponents]
    };
  }

  contextForSignal(signal) {
    const links = this.signalRepository.listSignalArticles(signal.id);
    const allArticles = links.map((link) => this.articleRepository.getArticle(link.articleId)).filter(Boolean);
    const articles = allArticles.filter(isScoringEligibleArticle);
    const sources = articles.map((article) => this.getSource(article.sourceId)).filter(Boolean);
    const relations = this.sourceRelationRepository.listRelations();
    const articleIds = new Set(articles.map((article) => article.id));
    const signalRelations = relations.filter((relation) => {
      if (relation.articleId && !articleIds.has(relation.articleId)) {
        return false;
      }
      return relation.signalId === signal.id || articleIds.has(relation.articleId);
    });
    const signalSupportRelations = signalRelations.filter((relation) => relation.relationType === 'signal_support');
    const duplicateRelations = signalRelations.filter((relation) => relation.relationType === 'duplicate_confirmed' && relation.evidence?.scoreImpact?.duplicateSupport === true);
    const topicAssignments = this.topicRepository.listSignalTopics(signal.id);

    return {
      freshness: freshnessValue(newestPublishedAt(articles), this.now()),
      sourceCount: sourceCountValue(sources),
      sourceDiversity: sourceDiversityValue(sources),
      duplicateSupport: duplicateSupportValue(duplicateRelations),
      duplicateConfidence: duplicateConfidenceValue(duplicateRelations),
      communityActivity: communityActivityValue(articles),
      sourceTrust: sourceTrustValue(sources),
      evidenceStrength: evidenceStrengthValue(signalSupportRelations, articles, duplicateRelations),
      contentQuality: contentQualityValue(articles),
      topicConfidence: topicConfidenceValue(topicAssignments),
      topicVelocity: topicVelocityValue(signal, topicAssignments, this.signalRepository.listSignals(), this.topicRepository)
    };
  }

  getSource(sourceId) {
    try {
      return this.sourceService?.getSource(sourceId);
    } catch {
      return undefined;
    }
  }
}

function component(name, value, weight) {
  const normalized = clamp01(value);
  return {
    component: name,
    value: round(normalized),
    weight,
    contribution: round(normalized * weight)
  };
}

function freshnessValue(publishedAt, now) {
  if (!publishedAt) {
    return 0.15;
  }
  const ageHours = Math.max(0, (now.getTime() - new Date(publishedAt).getTime()) / (1000 * 60 * 60));
  if (ageHours <= 6) {
    return 1;
  }
  if (ageHours <= 24) {
    return 0.9;
  }
  if (ageHours <= 72) {
    return 0.65;
  }
  if (ageHours <= 168) {
    return 0.4;
  }
  if (ageHours <= 336) {
    return 0.18;
  }
  return 0.05;
}

function sourceCountValue(sources) {
  return Math.min(unique(sources.map((source) => source.id)).length / 4, 1);
}

function sourceDiversityValue(sources) {
  return Math.min(unique(sources.map((source) => source.family).filter(Boolean)).length / 4, 1);
}

function duplicateSupportValue(duplicateRelations) {
  return Math.min(duplicateRelations.length / 3, 1);
}

function duplicateConfidenceValue(duplicateRelations) {
  if (duplicateRelations.length === 0) {
    return 0;
  }
  return average(duplicateRelations.map((relation) => relation.evidence?.confidence || relation.evidence?.scoreImpact?.credibilityBoost || 0.7));
}

function communityActivityValue(articles) {
  const activity = articles.reduce((total, article) => {
    const community = article.extractionMeta?.community || {};
    return total + (community.score || 0) + ((community.commentsCount || community.comments || 0) * 2) + (community.votes || 0);
  }, 0);
  return Math.min(activity / 250, 1);
}

function sourceTrustValue(sources) {
  if (sources.length === 0) {
    return 0.35;
  }
  return average(sources.map((source) => source.trustScore || 0.35));
}

function evidenceStrengthValue(signalSupportRelations, articles, duplicateRelations) {
  if (articles.length === 0) {
    return 0;
  }
  const clusterScore = signalSupportRelations.length > 0
    ? average(signalSupportRelations.map((relation) => relation.evidence?.clusterScore || 0.5))
    : 0.45;
  const uniqueSourceCount = unique(articles.map((article) => article.sourceId).filter(Boolean)).length;
  const sourceEvidence = Math.min(uniqueSourceCount / 4, 1);
  const duplicateEvidence = duplicateRelations.length > 0 ? 0.2 : 0;
  const value = Math.min((clusterScore * 0.55) + (sourceEvidence * 0.35) + duplicateEvidence, 1);
  const singleSourceCap = uniqueSourceCount <= 1 && duplicateRelations.length === 0 ? 0.58 : 1;
  return Math.min(value, singleSourceCap);
}

function contentQualityValue(articles) {
  if (articles.length === 0) {
    return 0;
  }
  return average(articles.map((article) => {
    let value = 0;
    if (article.title && article.title.length >= 18) {
      value += 0.25;
    }
    if (article.excerpt && article.excerpt.length >= 20) {
      value += 0.2;
    }
    if (article.textForAI && article.textForAI.length >= 80) {
      value += 0.4;
    } else if (article.textForAI) {
      value += 0.2;
    }
    if (article.canonicalUrl) {
      value += 0.15;
    }
    return Math.min(value, 1);
  }));
}

function topicConfidenceValue(topicAssignments) {
  if (topicAssignments.length === 0) {
    return 0.25;
  }
  return average(topicAssignments.map((assignment) => assignment.confidence || 0.25));
}

function topicVelocityValue(signal, topicAssignments, signals, topicRepository) {
  if (topicAssignments.length === 0 || !signal.primaryPublishedAt) {
    return 0;
  }
  const signalTime = new Date(signal.primaryPublishedAt).getTime();
  const topicSlugs = new Set(topicAssignments.map((assignment) => assignment.topicSlug));
  const relatedCount = signals.filter((candidate) => {
    if (candidate.id === signal.id || !candidate.primaryPublishedAt) {
      return false;
    }
    const hoursApart = Math.abs(signalTime - new Date(candidate.primaryPublishedAt).getTime()) / (1000 * 60 * 60);
    if (hoursApart > 72) {
      return false;
    }
    return topicRepository.listSignalTopics(candidate.id).some((assignment) => topicSlugs.has(assignment.topicSlug));
  }).length;
  return Math.min(relatedCount / 3, 1);
}

function newestPublishedAt(articles) {
  return articles
    .map((article) => article.publishedAt)
    .filter(Boolean)
    .sort()
    .at(-1);
}

function isScoringEligibleArticle(article) {
  return article.visibilityStatus !== 'hidden_latest' && article.qualityStatus !== 'low_quality';
}

function scoreSum(components) {
  return round(components.reduce((total, item) => total + item.contribution, 0));
}

function average(values) {
  const usable = values.filter((value) => typeof value === 'number' && !Number.isNaN(value));
  if (usable.length === 0) {
    return 0;
  }
  return usable.reduce((total, value) => total + value, 0) / usable.length;
}

function unique(values) {
  return Array.from(new Set(values));
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
