const relatedTitleThreshold = 0.62;
const clusterTimeWindowHours = 48;

export class SignalClusterService {
  constructor({ articleRepository, signalRepository, sourceRelationRepository, sourceService, now = () => new Date() } = {}) {
    this.articleRepository = articleRepository;
    this.signalRepository = signalRepository;
    this.sourceRelationRepository = sourceRelationRepository;
    this.sourceService = sourceService;
    this.now = now;
  }

  clusterArticles() {
    const allArticles = this.articleRepository.listArticles();
    const articles = allArticles.filter(isVisibleLatestArticle).sort(articleSort);
    const relations = this.sourceRelationRepository.listRelations();
    const duplicateMap = createDuplicateMap(relations);
    const assigned = new Set();
    let createdSignals = 0;
    let updatedSignals = 0;
    let linkedArticles = 0;

    for (const article of articles) {
      if (assigned.has(article.id)) {
        continue;
      }

      const cluster = [article];
      assigned.add(article.id);

      for (const candidate of articles) {
        if (assigned.has(candidate.id)) {
          continue;
        }
        const evidence = clusterEvidence(cluster, candidate, duplicateMap);
        if (evidence.shouldCluster) {
          cluster.push(candidate);
          assigned.add(candidate.id);
        }
      }

      const lead = chooseLead(cluster, (sourceId) => this.getSource(sourceId));
      let signal = this.signalRepository.findSignalByArticleIds(cluster.map((member) => member.id));
      if (signal) {
        signal = this.signalRepository.touchSignal(signal.id);
        updatedSignals += 1;
      } else if (typeof this.signalRepository.findSignalByLeadArticleId === 'function') {
        signal = this.signalRepository.findSignalByLeadArticleId(lead.id);
        if (signal) {
          signal = this.signalRepository.touchSignal(signal.id);
          updatedSignals += 1;
        }
      } else {
        signal = undefined;
      }

      if (!signal) {
        signal = this.signalRepository.createSignal({
          title: lead.title,
          primaryPublishedAt: lead.publishedAt,
          status: 'candidate',
          enrichmentStatus: 'pending'
        });
        createdSignals += 1;
      }

      const clusterArticleIds = new Set(cluster.map((member) => member.id));
      this.signalRepository.replaceSignalArticles?.(signal.id, cluster.map((member) => ({
        articleId: member.id,
        role: member.id === lead.id ? 'lead' : 'supporting'
      })));
      this.sourceRelationRepository.deleteRelations?.((relation) => (
        relation.relationType === 'signal_support'
        && relation.signalId === signal.id
        && relation.articleId
        && !clusterArticleIds.has(relation.articleId)
      ));
      for (const historicalSignal of this.signalRepository.findSignalsByLeadArticleId?.(lead.id) || []) {
        if (historicalSignal.id === signal.id) {
          continue;
        }
        this.signalRepository.replaceSignalArticles?.(historicalSignal.id, cluster.map((member) => ({
          articleId: member.id,
          role: member.id === lead.id ? 'lead' : 'supporting'
        })));
        this.sourceRelationRepository.deleteRelations?.((relation) => (
          relation.relationType === 'signal_support'
          && relation.signalId === historicalSignal.id
          && relation.articleId
          && !clusterArticleIds.has(relation.articleId)
        ));
      }

      for (const member of cluster) {
        const role = member.id === lead.id ? 'lead' : 'supporting';
        this.signalRepository.linkArticle({
          signalId: signal.id,
          articleId: member.id,
          role
        });
        this.sourceRelationRepository.upsertRelation({
          sourceId: member.sourceId,
          articleId: member.id,
          signalId: signal.id,
          relationType: 'signal_support',
          evidence: {
            ...clusterMemberEvidence(lead, member, duplicateMap),
            role,
            detectedAt: this.now().toISOString()
          }
        });
        linkedArticles += 1;
      }
    }

    return {
      checkedArticles: allArticles.length,
      eligibleArticles: articles.length,
      createdSignals,
      updatedSignals,
      linkedArticles,
      unclusteredArticles: allArticles.length - articles.length
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

function isVisibleLatestArticle(article) {
  return article.visibilityStatus !== 'hidden_latest' && article.qualityStatus !== 'low_quality';
}

function clusterEvidence(cluster, candidate, duplicateMap) {
  let best = { shouldCluster: false, clusterScore: 0, reasons: [] };
  for (const member of cluster) {
    const evidence = pairEvidence(member, candidate, duplicateMap);
    if (evidence.clusterScore > best.clusterScore) {
      best = evidence;
    }
  }
  return best;
}

function clusterMemberEvidence(lead, member, duplicateMap) {
  if (lead.id === member.id) {
    return {
      clusterScore: 1,
      titleSimilarity: 1,
      hoursApart: 0,
      reasons: ['lead_article']
    };
  }
  return pairEvidence(lead, member, duplicateMap);
}

function pairEvidence(first, second, duplicateMap) {
  const reasons = [];
  if (duplicateMap.get(first.id)?.has(second.id)) {
    return {
      shouldCluster: true,
      clusterScore: 0.98,
      titleSimilarity: titleSimilarityScore(first.title, second.title),
      hoursApart: publicationHoursApart(first.publishedAt, second.publishedAt),
      reasons: ['duplicate_confirmed']
    };
  }

  const titleSimilarity = titleSimilarityScore(first.title, second.title);
  const hoursApart = publicationHoursApart(first.publishedAt, second.publishedAt);
  const withinTimeWindow = hoursApart === undefined || hoursApart <= clusterTimeWindowHours;
  if (titleSimilarity >= relatedTitleThreshold) {
    reasons.push('title_similarity');
  }
  if (withinTimeWindow) {
    reasons.push('time_window');
  }
  if (first.sourceId && second.sourceId && first.sourceId !== second.sourceId) {
    reasons.push('source_diversity');
  }

  const sourceDiversityBoost = reasons.includes('source_diversity') ? 0.06 : 0;
  const timeMultiplier = withinTimeWindow ? 1 : 0.45;
  const clusterScore = round(Math.min(0.94, (titleSimilarity + sourceDiversityBoost) * timeMultiplier));

  return {
    shouldCluster: titleSimilarity >= relatedTitleThreshold && withinTimeWindow && reasons.includes('source_diversity'),
    clusterScore,
    titleSimilarity: round(titleSimilarity),
    hoursApart,
    reasons
  };
}

function createDuplicateMap(relations) {
  const map = new Map();
  for (const relation of relations) {
    if (relation.relationType !== 'duplicate_confirmed' || !relation.articleId || !relation.evidence?.targetArticleId) {
      continue;
    }
    addPair(map, relation.articleId, relation.evidence.targetArticleId);
    addPair(map, relation.evidence.targetArticleId, relation.articleId);
  }
  return map;
}

function addPair(map, first, second) {
  if (!map.has(first)) {
    map.set(first, new Set());
  }
  map.get(first).add(second);
}

function chooseLead(cluster, getSource) {
  return [...cluster].sort((first, second) => {
    const firstSource = getSource(first.sourceId);
    const secondSource = getSource(second.sourceId);
    const firstTrust = firstSource?.trustScore || 0;
    const secondTrust = secondSource?.trustScore || 0;
    if (firstTrust !== secondTrust) {
      return secondTrust - firstTrust;
    }

    const firstOfficial = firstSource?.family === 'company_announcement' ? 1 : 0;
    const secondOfficial = secondSource?.family === 'company_announcement' ? 1 : 0;
    if (firstOfficial !== secondOfficial) {
      return secondOfficial - firstOfficial;
    }

    const firstText = first.textForAI ? 1 : 0;
    const secondText = second.textForAI ? 1 : 0;
    if (firstText !== secondText) {
      return secondText - firstText;
    }

    return new Date(first.publishedAt || first.createdAt).getTime() - new Date(second.publishedAt || second.createdAt).getTime();
  })[0];
}

function titleSimilarityScore(firstTitle, secondTitle) {
  const firstTokens = titleTokens(firstTitle);
  const secondTokens = titleTokens(secondTitle);
  if (firstTokens.length === 0 || secondTokens.length === 0) {
    return 0;
  }

  const secondTokenSet = new Set(secondTokens);
  const intersection = firstTokens.filter((token) => secondTokenSet.has(token)).length;
  return round((2 * intersection) / (firstTokens.length + secondTokens.length));
}

function titleTokens(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token && !stopWords.has(token));
}

function publicationHoursApart(first, second) {
  if (!first || !second) {
    return undefined;
  }
  const firstTime = new Date(first).getTime();
  const secondTime = new Date(second).getTime();
  if (Number.isNaN(firstTime) || Number.isNaN(secondTime)) {
    return undefined;
  }
  return Math.abs(firstTime - secondTime) / (1000 * 60 * 60);
}

function articleSort(first, second) {
  const firstTime = new Date(first.publishedAt || first.createdAt).getTime();
  const secondTime = new Date(second.publishedAt || second.createdAt).getTime();
  if (firstTime !== secondTime) {
    return firstTime - secondTime;
  }
  return first.id.localeCompare(second.id);
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

const stopWords = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'for',
  'from',
  'in',
  'into',
  'new',
  'of',
  'on',
  'the',
  'to',
  'with'
]);
