export class TopicClassifier {
  constructor({ topicRepository, signalRepository, articleRepository, sourceService, now = () => new Date() } = {}) {
    this.topicRepository = topicRepository;
    this.signalRepository = signalRepository;
    this.articleRepository = articleRepository;
    this.sourceService = sourceService;
    this.now = now;
  }

  classifySignals() {
    this.topicRepository.seedDefaultTopics();
    const signals = this.signalRepository.listSignals();
    let topicAssignments = 0;

    for (const signal of signals) {
      const context = this.signalContext(signal);
      const candidates = classifyContext(context);
      for (const candidate of candidates) {
        this.topicRepository.upsertSignalTopic({
          signalId: signal.id,
          topicSlug: candidate.topicSlug,
          method: 'rule',
          confidence: candidate.confidence,
          reason: candidate.reason,
          evidence: {
            matchedBy: candidate.matchedBy,
            matchedTerms: candidate.matchedTerms,
            sourceFamilies: context.sourceFamilies,
            sourceTypes: context.sourceTypes,
            aiReady: true,
            classifiedAt: this.now().toISOString()
          }
        });
        topicAssignments += 1;
      }
    }

    return {
      checkedSignals: signals.length,
      classifiedSignals: signals.filter((signal) => this.topicRepository.listSignalTopics(signal.id).length > 0).length,
      topicAssignments
    };
  }

  signalContext(signal) {
    const links = this.signalRepository.listSignalArticles(signal.id);
    const articles = links
      .map((link) => this.articleRepository.getArticle(link.articleId))
      .filter(Boolean);
    const sources = articles
      .map((article) => this.getSource(article.sourceId))
      .filter(Boolean);
    const text = [
      signal.title,
      signal.summary,
      ...articles.flatMap((article) => [article.title, article.excerpt, article.textForAI])
    ].filter(Boolean).join('\n').toLowerCase();

    return {
      signal,
      articles,
      sources,
      text,
      sourceFamilies: unique(sources.map((source) => source.family).filter(Boolean)),
      sourceTypes: unique(sources.map((source) => source.sourceType).filter(Boolean))
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

function classifyContext(context) {
  const candidates = [];
  addSourceFamilyTopics(candidates, context);
  for (const rule of keywordRules) {
    const matchedTerms = matchingTerms(context.text, rule.terms);
    if (matchedTerms.length > 0) {
      candidates.push({
        topicSlug: rule.topicSlug,
        confidence: rule.confidence,
        reason: rule.reason,
        matchedBy: 'keyword',
        matchedTerms
      });
    }
  }

  return dedupeCandidates(candidates);
}

function addSourceFamilyTopics(candidates, context) {
  if (context.sourceFamilies.includes('research') || context.sourceTypes.some((type) => ['arxiv', 'semantic_scholar', 'crossref'].includes(type))) {
    candidates.push({
      topicSlug: 'research',
      confidence: 0.88,
      reason: 'The signal is backed by research source metadata.',
      matchedBy: 'source_family',
      matchedTerms: ['research']
    });
  }
  if (context.sourceFamilies.includes('company_announcement')) {
    candidates.push({
      topicSlug: 'company-announcements',
      confidence: 0.86,
      reason: 'The lead evidence includes an official company announcement source.',
      matchedBy: 'source_family',
      matchedTerms: ['company_announcement']
    });
  }
  if (context.sourceFamilies.includes('funding')) {
    candidates.push({
      topicSlug: 'funding',
      confidence: 0.84,
      reason: 'The source family identifies this signal as funding-related.',
      matchedBy: 'source_family',
      matchedTerms: ['funding']
    });
  }
  if (context.sourceFamilies.includes('policy')) {
    candidates.push({
      topicSlug: 'policy',
      confidence: 0.84,
      reason: 'The source family identifies this signal as policy-related.',
      matchedBy: 'source_family',
      matchedTerms: ['policy']
    });
  }
  if (context.sourceFamilies.includes('product_launch')) {
    candidates.push({
      topicSlug: 'large-model-products',
      confidence: 0.74,
      reason: 'The source family indicates a product launch or model product update.',
      matchedBy: 'source_family',
      matchedTerms: ['product_launch']
    });
  }
}

function dedupeCandidates(candidates) {
  const bySlug = new Map();
  for (const candidate of candidates) {
    const existing = bySlug.get(candidate.topicSlug);
    if (!existing || candidate.confidence > existing.confidence) {
      bySlug.set(candidate.topicSlug, {
        ...candidate,
        confidence: round(candidate.confidence)
      });
    }
  }
  return Array.from(bySlug.values());
}

function matchingTerms(text, terms) {
  return terms.filter((term) => term.test(text)).map((term) => term.source.replace(/\\b/g, '').replace(/\\/g, ''));
}

function unique(values) {
  return Array.from(new Set(values));
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

const keywordRules = [
  {
    topicSlug: 'ai-agent',
    confidence: 0.82,
    reason: 'The signal mentions agents, tool use, or workflow automation.',
    terms: [/\bagent\b/i, /\bagentic\b/i, /\btool use\b/i, /\bworkflow automation\b/i, /\bautonomous workflow\b/i]
  },
  {
    topicSlug: 'large-model-products',
    confidence: 0.76,
    reason: 'The signal describes a model, LLM product, workspace, or developer API launch.',
    terms: [/\bllm\b/i, /\blarge language model\b/i, /\bgpt\b/i, /\bgemini\b/i, /\bclaude\b/i, /\bmodel workspace\b/i, /\bdeveloper api\b/i, /\bfoundation model\b/i]
  },
  {
    topicSlug: 'ai-video',
    confidence: 0.82,
    reason: 'The signal mentions AI video generation or video editing capabilities.',
    terms: [/\bvideo generation\b/i, /\btext-to-video\b/i, /\bimage-to-video\b/i, /\bveo\b/i, /\bsora\b/i, /\brunway\b/i, /\bpika\b/i, /\bvideo editing\b/i]
  },
  {
    topicSlug: 'edge-models',
    confidence: 0.8,
    reason: 'The signal mentions edge deployment or on-device inference.',
    terms: [/\bedge ai\b/i, /\bedge model\b/i, /\bon-device\b/i, /\blocal inference\b/i, /\bnpu\b/i, /\bmobile deployment\b/i, /\bcompact model\b/i]
  },
  {
    topicSlug: 'policy',
    confidence: 0.8,
    reason: 'The signal mentions AI policy, regulation, safety governance, or compliance.',
    terms: [/\bpolicy\b/i, /\bregulation\b/i, /\bregulators?\b/i, /\bai act\b/i, /\bgovernance\b/i, /\bcompliance\b/i, /\bsafety reporting\b/i, /\bcopyright\b/i]
  },
  {
    topicSlug: 'research',
    confidence: 0.78,
    reason: 'The signal mentions papers, benchmarks, datasets, or evaluations.',
    terms: [/\barxiv\b/i, /\bpaper\b/i, /\bbenchmark\b/i, /\bdataset\b/i, /\bevaluation\b/i, /\bresearch\b/i]
  },
  {
    topicSlug: 'funding',
    confidence: 0.82,
    reason: 'The signal mentions funding, investment rounds, or valuation.',
    terms: [/\bfunding\b/i, /\braises?\b/i, /\bseries [abc]\b/i, /\bseed round\b/i, /\binvestors?\b/i, /\bvaluation\b/i]
  },
  {
    topicSlug: 'company-announcements',
    confidence: 0.76,
    reason: 'The signal uses announcement or release language associated with official updates.',
    terms: [/\bannounces?\b/i, /\bintroduces?\b/i, /\breleases?\b/i, /\blaunched?\b/i, /\brelease notes?\b/i]
  }
];
