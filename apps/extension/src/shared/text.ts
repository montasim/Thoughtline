import { AppError } from '../application/errors';

const BIDI_CONTROLS = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

export function normalizeUntrustedText(value: string): string {
  return value
    .normalize('NFKC')
    .split('')
    .filter((character) => {
      const code = character.charCodeAt(0);
      return (
        character === '\n' || character === '\t' || (code >= 32 && !(code >= 127 && code <= 159))
      );
    })
    .join('')
    .replace(BIDI_CONTROLS, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function plainTextFromMarkdown(value: string): string {
  const plain = normalizeUntrustedText(value)
    .replace(/^[ \t]*(?:```|~~~)[^\n]*$/gmu, '')
    .replace(/^[ \t]{0,3}(?:[-*_][ \t]*){3,}$/gmu, '')
    .replace(/!\[([^\]\n]*)\]\([^)]+\)/gu, '$1')
    .replace(/\[([^\]\n]+)\]\(([^)\s]+)(?:[ \t]+["'][^"']*["'])?\)/gu, '$1 ($2)')
    .replace(/<((?:https?:\/\/|mailto:)[^>\s]+)>/gu, '$1')
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gmu, '')
    .replace(/^[ \t]{0,3}>[ \t]?/gmu, '')
    .replace(/^([ \t]*)[-+*][ \t]+/gmu, '$1• ')
    .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/gu, '$2')
    .replace(/~~(?=\S)([\s\S]*?\S)~~/gu, '$1')
    .replace(/`([^`\n]+)`/gu, '$1')
    .replace(/(?<![\p{L}\p{N}])([*_])(?=\S)([^*_\n]*?\S)\1(?![\p{L}\p{N}])/gu, '$2')
    .replace(/\\([\\`*_[\]{}()#+\-.!>])/gu, '$1');
  return normalizeUntrustedText(plain);
}

export function hasSourceResponseFraming(value: string): boolean {
  const normalized = normalizeUntrustedText(value);
  return [
    /\b(?:your|the source author's|the original author's)\s+(?:post|list|thread|article|analysis)\b/iu,
    /আপনার(?:\s+\S+){0,2}\s+(?:পোস্ট|তালিকা|লেখা|বিশ্লেষণ)/u,
    /আশা করি\s+(?:এই\s+)?বিশ্লেষণ/u,
    /\b(?:building on|responding to|in response to)\s+(?:this|the|your)\s+(?:post|list|thread|article)\b/iu,
  ].some((pattern) => pattern.test(normalized));
}

export function assertContextBudget(parts: readonly string[], maximumCharacters = 80_000): void {
  const size = parts.reduce((total, part) => total + part.length, 0);
  if (size > maximumCharacters) {
    throw new AppError(
      'context-overflow',
      'This content is too large for the selected model. Reduce the visible discussion and try again.',
    );
  }
}

export function countWords(value: string): number {
  return value.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
}

export function hasSubstantialEdit(generated: string, edited: string): boolean {
  const cleanGenerated = tokenize(generated);
  const cleanEdited = tokenize(edited);
  const threshold = Math.max(3, Math.ceil(cleanGenerated.length * 0.1));
  return editDistance(cleanGenerated, cleanEdited) >= threshold;
}

export function hasSharedPhrase(source: string, candidate: string, minimumWords = 8): boolean {
  const sourceWords = tokenize(source);
  const candidateWords = tokenize(candidate);
  if (
    minimumWords < 1 ||
    sourceWords.length < minimumWords ||
    candidateWords.length < minimumWords
  ) {
    return false;
  }
  const sourcePhrases = new Set<string>();
  for (let index = 0; index <= sourceWords.length - minimumWords; index += 1) {
    sourcePhrases.add(sourceWords.slice(index, index + minimumWords).join(' '));
  }
  for (let index = 0; index <= candidateWords.length - minimumWords; index += 1) {
    if (sourcePhrases.has(candidateWords.slice(index, index + minimumWords).join(' '))) return true;
  }
  return false;
}

function tokenize(value: string): string[] {
  return (
    normalizeUntrustedText(value)
      .toLocaleLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}

function editDistance(left: readonly string[], right: readonly string[]): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(
        (current[column - 1] ?? 0) + 1,
        (previous[column] ?? 0) + 1,
        (previous[column - 1] ?? 0) + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length] ?? 0;
}
