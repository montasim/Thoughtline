import {
  defaultAppData,
  defaultSessionState,
  type AppData,
  type SessionState,
  type SourceEvidence,
} from '../../src/domain/schemas';

const ids = {
  reply: '10000000-0000-4000-8000-000000000001',
  rewrite: '10000000-0000-4000-8000-000000000002',
  idea: '10000000-0000-4000-8000-000000000003',
  candidate: '10000000-0000-4000-8000-000000000004',
  candidate2: '10000000-0000-4000-8000-000000000006',
  source: 'source-dev-1',
  source2: 'source-stack-overflow-1',
  session: '10000000-0000-4000-8000-000000000005',
  feedback: '10000000-0000-4000-8000-000000000007',
} as const;

const timestamp = '2026-07-22T04:42:00.000Z';
const visualSource: SourceEvidence = {
  id: ids.source,
  source: 'dev',
  title: 'TypeScript Patterns for Production AI Apps',
  excerpt: 'A practical guide to validation at service boundaries.',
  url: 'https://dev.to/example/typescript-patterns',
  tags: ['typescript', 'architecture'],
  publishedAt: timestamp,
  aggregateSignal: '128 reactions · 18 comments',
};

const visualSource2: SourceEvidence = {
  id: ids.source2,
  source: 'stack-overflow',
  title: 'Checklist for Database Schema Upgrades',
  excerpt: 'A practical migration review checklist organized around risk and boundaries.',
  url: 'https://stackoverflow.com/questions/example/schema-upgrades',
  tags: ['database', 'migration'],
  publishedAt: '2026-07-21T10:42:00.000Z',
  aggregateSignal: '86 votes · 11 answers',
};

export function visualAppData(): AppData {
  return {
    ...structuredClone(defaultAppData),
    settings: {
      ...defaultAppData.settings,
      onboardingComplete: true,
      consent: { accepted: true, version: 1, acceptedAt: timestamp },
      publicResearchEnabled: true,
      providerValidation: {
        gemini: { state: 'valid', credentialVersion: 1, checkedAt: timestamp },
        groq: { state: 'valid', credentialVersion: 1, checkedAt: timestamp },
      },
    },
    profile: {
      ...defaultAppData.profile,
      role: 'Senior software engineer',
      topics: ['TypeScript', 'architecture', 'AI tooling', 'engineering leadership'],
      audience: 'Engineering leaders',
    },
    history: [
      {
        id: ids.reply,
        type: 'reply',
        createdAt: timestamp,
        updatedAt: timestamp,
        provider: 'gemini',
        title: 'Architecture decisions need visible assumptions',
        source: {
          author: 'Maya Chen',
          permalink: 'https://www.linkedin.com/feed/update/urn:li:activity:123/',
          postExcerpt: 'Teams reach for architecture patterns too early…',
          targetExcerpt: 'Teams reach for architecture patterns too early.',
          wordCount: 53,
        },
        summary: {
          english:
            'The author argues that teams adopt architecture patterns before their constraints are clear, then keep defending those choices after the context changes.',
          bangla:
            'লেখক বলছেন, সীমাবদ্ধতা স্পষ্ট হওয়ার আগেই দলগুলো আর্কিটেকচার প্যাটার্ন বেছে নেয় এবং প্রেক্ষাপট বদলালেও সেই সিদ্ধান্ত ধরে রাখে।',
        },
        reviewNote: 'The discussion does not state how long this architecture is expected to last.',
        selectedDirection: 'insight',
        directions: [
          {
            id: 'insight',
            generatedText:
              'A useful way to frame this is that architecture decisions rarely fail because a team chose the “wrong” pattern. They fail when the assumptions behind that choice remain invisible.\n\nWriting down the constraint, expected lifetime, and reversal cost makes the decision easier to revisit without turning it into a debate about personal preference.',
            currentText:
              'A useful way to frame this is that architecture decisions rarely fail because a team chose the “wrong” pattern. They fail when the assumptions behind that choice remain invisible.\n\nWriting down the constraint, expected lifetime, and reversal cost makes the decision easier to revisit without turning it into a debate about personal preference.',
            approach:
              'Add a practical decision-making lens without claiming the author’s experience.',
            revisions: [],
            feedback: {
              id: ids.feedback,
              rating: 'liked',
              generatedText:
                'A useful way to frame this is that architecture decisions rarely fail because a team chose the “wrong” pattern. They fail when the assumptions behind that choice remain invisible.\n\nWriting down the constraint, expected lifetime, and reversal cost makes the decision easier to revisit without turning it into a debate about personal preference.',
              editedText:
                'A useful way to frame this is that architecture decisions rarely fail because a team chose the “wrong” pattern. They fail when the assumptions behind that choice remain invisible.\n\nWriting down the constraint, expected lifetime, and reversal cost makes the decision easier to revisit without turning it into a debate about personal preference.',
              createdAt: timestamp,
            },
          },
          {
            id: 'question',
            generatedText: 'Which constraint would make you revisit the pattern first?',
            currentText: 'Which constraint would make you revisit the pattern first?',
            approach: 'Ask one grounded question.',
            revisions: [],
          },
          {
            id: 'extend',
            generatedText: 'Making assumptions visible also gives review teams a shared baseline.',
            currentText: 'Making assumptions visible also gives review teams a shared baseline.',
            approach: 'Extend the original idea.',
            revisions: [],
          },
          {
            id: 'challenge',
            generatedText:
              'Patterns can still help when teams treat them as hypotheses, not commitments.',
            currentText:
              'Patterns can still help when teams treat them as hypotheses, not commitments.',
            approach: 'Offer respectful disagreement.',
            revisions: [],
          },
        ],
      },
      {
        id: ids.rewrite,
        type: 'rewrite',
        createdAt: timestamp,
        updatedAt: timestamp,
        provider: 'gemini',
        original: 'Typescript makes boundary validation important.',
        goal: 'clearer',
        customGoal: '',
        generatedText:
          'TypeScript can describe a system perfectly and still leave its riskiest boundaries unprotected.',
        currentText:
          'TypeScript can describe a system perfectly and still leave its riskiest boundaries unprotected.',
        revisions: [],
      },
      {
        id: ids.idea,
        type: 'idea',
        createdAt: timestamp,
        updatedAt: timestamp,
        provider: 'gemini',
        title: 'Runtime boundaries matter more than adding TypeScript types everywhere',
        origin: {
          kind: 'source',
          evidence: visualSource,
        },
        summary: {
          english:
            'This post argues that runtime validation should focus on risky trust boundaries, starting with external inputs, third-party responses, and cross-service messages.',
          bangla:
            'এই পোস্টে ঝুঁকিপূর্ণ ট্রাস্ট বাউন্ডারিতে রানটাইম ভ্যালিডেশনকে অগ্রাধিকার দেওয়ার কথা বলা হয়েছে।',
        },
        direction:
          'Turn the source’s validation guidance into a boundary-first decision framework.',
        generatedText:
          'TypeScript can describe a system perfectly and still leave its riskiest boundaries unprotected.\n\nStart with external inputs, third-party responses, stored legacy data, and messages crossing service boundaries. Validate those deliberately.',
        currentText:
          'TypeScript can describe a system perfectly and still leave its riskiest boundaries unprotected.\n\nStart with external inputs, third-party responses, stored legacy data, and messages crossing service boundaries. Validate those deliberately.',
        revisions: [],
      },
    ],
  };
}

export function visualSession(activeTab: SessionState['activeTab'] = 'reply'): SessionState {
  return {
    ...structuredClone(defaultSessionState),
    activeTab,
    activeRecordId:
      activeTab === 'reply'
        ? ids.reply
        : activeTab === 'generate'
          ? ids.rewrite
          : activeTab === 'idea'
            ? ids.idea
            : undefined,
    ideaView: activeTab === 'idea' ? 'results' : 'search',
    ideaSession: {
      id: ids.session,
      createdAt: timestamp,
      unavailableSources: [],
      createdRecordIds: { [ids.candidate]: ids.idea },
      candidates: [
        {
          id: ids.candidate,
          title: 'Runtime boundaries matter more than adding TypeScript types everywhere',
          fit: 'strong',
          rationale:
            'This fits your systems perspective and gives engineering leaders a concrete way to prioritize validation work.',
          improvement: '',
          source: visualSource,
        },
        {
          id: ids.candidate2,
          title: 'Migration reviews work better when teams rank risk before tools',
          fit: 'good',
          rationale:
            'A practical checklist gives your audience something specific to compare with their own migration process.',
          improvement: 'Best if you add one example of a boundary your team prioritized.',
          source: visualSource2,
        },
      ],
    },
  };
}
