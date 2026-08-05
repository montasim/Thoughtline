export interface QualityCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface QualityReport {
  score: number;
  passed: boolean;
  checks: QualityCheck[];
}

interface TextPolicy {
  requiredAnchors?: string[];
  forbiddenClaims?: string[];
  maxWords?: number;
  allowEmoji?: boolean;
  allowHashtags?: boolean;
}

interface ReplyDirection {
  id: 'insight' | 'question' | 'extend' | 'challenge';
  text: string;
}

export function evaluateReplyQuality(input: {
  source: string;
  directions: ReplyDirection[];
  policy: TextPolicy;
}): QualityReport {
  const checks: QualityCheck[] = [];
  checks.push(
    check(
      'four named directions',
      input.directions.length === 4 &&
        new Set(input.directions.map(({ id }) => id)).size === 4 &&
        ['insight', 'question', 'extend', 'challenge'].every((id) =>
          input.directions.some((direction) => direction.id === id),
        ),
      'Insight, Question, Extend, and Challenge must each appear once.',
    ),
  );

  for (const direction of input.directions) {
    checks.push(...textPolicyChecks(`${direction.id} reply`, direction.text, input.policy));
    checks.push(
      check(
        `${direction.id} has no direction prefix`,
        !/^(insight|question|extend|challenge)\s*:/iu.test(direction.text.trim()),
        'The editable draft must contain only the reply body.',
      ),
    );
  }

  const question = input.directions.find(({ id }) => id === 'question')?.text ?? '';
  checks.push(
    check(
      'question behaves like a question',
      question.trim().endsWith('?') && (question.match(/\?/gu)?.length ?? 0) === 1,
      'The Question direction must ask one specific question.',
    ),
  );
  const challenge = input.directions.find(({ id }) => id === 'challenge')?.text ?? '';
  checks.push(
    check(
      'challenge signals respectful qualification',
      /\b(but|however|yet|while|although|still|rather than)\b/iu.test(challenge),
      'The Challenge direction must visibly qualify or disagree with the source.',
    ),
  );

  for (let left = 0; left < input.directions.length; left += 1) {
    for (let right = left + 1; right < input.directions.length; right += 1) {
      const a = input.directions[left];
      const b = input.directions[right];
      if (!a || !b) continue;
      checks.push(
        check(
          `${a.id} and ${b.id} are distinct`,
          jaccardSimilarity(a.text, b.text) < 0.72,
          'Directions must differ in substance, not only their opening phrase.',
        ),
      );
    }
  }

  checks.push(
    check(
      'source contains the expected grounding anchors',
      (input.policy.requiredAnchors ?? []).some((anchor) => includes(input.source, anchor)),
      'A malformed quality case must not pass because its source omitted the expected facts.',
    ),
  );
  return report(checks);
}

export function evaluateRewriteQuality(input: {
  source: string;
  output: string;
  goal: 'clearer' | 'shorter' | 'more-professional' | 'more-conversational' | 'custom';
  policy: TextPolicy;
}): QualityReport {
  const checks = textPolicyChecks('rewrite', input.output, input.policy);
  const sourceNumbers = extractNumbers(input.source);
  const outputNumbers = extractNumbers(input.output);
  checks.push(
    check(
      'preserves factual numbers',
      [...sourceNumbers].every((value) => outputNumbers.has(value)) &&
        [...outputNumbers].every((value) => sourceNumbers.has(value)),
      'A rewrite must preserve source numbers and must not introduce new ones.',
    ),
    check(
      'does not add assistant preamble',
      !/^(here(?:'s| is)|certainly|of course|rewritten version)/iu.test(input.output.trim()),
      'The editor should receive only the rewritten content.',
    ),
  );
  if (input.goal === 'shorter') {
    checks.push(
      check(
        'shorter goal reduces length',
        wordCount(input.output) < wordCount(input.source),
        'A shorter rewrite must contain fewer words than its source.',
      ),
    );
  }
  return report(checks);
}

export function evaluatePostQuality(input: {
  source: string;
  output: string;
  policy: TextPolicy;
}): QualityReport {
  const checks = textPolicyChecks('post', input.output, input.policy);
  checks.push(
    check(
      'uses readable LinkedIn paragraphs',
      input.output
        .split(/\n\s*\n/gu)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean).length >= 2,
      'A post should be scannable rather than one dense block.',
    ),
    check(
      'does not pretend to have read beyond supplied evidence',
      !/\b(in the full article|after reading the article|the author proves)\b/iu.test(input.output),
      'Source-based posts may use only supplied evidence.',
    ),
  );
  return report(checks);
}

export function failedChecks(report: QualityReport): string[] {
  return report.checks
    .filter(({ passed }) => !passed)
    .map(({ name, detail }) => `${name}: ${detail}`);
}

function textPolicyChecks(name: string, text: string, policy: TextPolicy): QualityCheck[] {
  const checks = [
    check(`${name} is not empty`, text.trim().length > 0, 'Generated text must not be empty.'),
    check(
      `${name} stays within the word budget`,
      wordCount(text) <= (policy.maxWords ?? Number.POSITIVE_INFINITY),
      `Expected no more than ${String(policy.maxWords ?? 'unlimited')} words.`,
    ),
    check(
      `${name} remains grounded`,
      (policy.requiredAnchors ?? []).some((anchor) => includes(text, anchor)),
      'At least one case-specific source anchor must survive in the output.',
    ),
    check(
      `${name} avoids forbidden claims`,
      (policy.forbiddenClaims ?? []).every((claim) => !includes(text, claim)),
      'The output introduced a claim that the source did not support.',
    ),
  ];
  if (!policy.allowEmoji) {
    checks.push(
      check(
        `${name} avoids emoji`,
        !/\p{Extended_Pictographic}/gu.test(text),
        'Emoji are disabled.',
      ),
    );
  }
  if (!policy.allowHashtags) {
    checks.push(
      check(
        `${name} avoids hashtags`,
        !/(^|\s)#[\p{L}\p{N}_]+/gu.test(text),
        'Hashtags are disabled.',
      ),
    );
  }
  return checks;
}

function check(name: string, passed: boolean, detail: string): QualityCheck {
  return { name, passed, detail };
}

function report(checks: QualityCheck[]): QualityReport {
  const passed = checks.filter((item) => item.passed).length;
  const score = checks.length === 0 ? 0 : Math.round((passed / checks.length) * 100);
  return { score, passed: passed === checks.length, checks };
}

function wordCount(value: string): number {
  return value.trim() ? value.trim().split(/\s+/gu).length : 0;
}

function includes(value: string, fragment: string): boolean {
  return value.toLocaleLowerCase().includes(fragment.toLocaleLowerCase());
}

function extractNumbers(value: string): Set<string> {
  return new Set(value.match(/\b\d+(?:[.,]\d+)*(?:%|x)?\b/gu) ?? []);
}

function jaccardSimilarity(left: string, right: string): number {
  const a = new Set(left.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
  const b = new Set(right.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
  const union = new Set([...a, ...b]);
  if (union.size === 0) return 1;
  return [...a].filter((token) => b.has(token)).length / union.size;
}
