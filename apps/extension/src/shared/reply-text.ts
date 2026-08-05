const REPLY_DIRECTION_PREFIX =
  /^\s*(?:\*{1,2})?\s*(?:insight|question|extend|challenge)\s*(?:\*{1,2})?\s*[:：\-–—]\s*(?:\*{1,2})?\s*/iu;

export function stripReplyDirectionPrefix(value: string): string {
  return value.replace(REPLY_DIRECTION_PREFIX, '').trim();
}

export function detectReplyLanguage(value: string): 'english' | 'bangla' | 'mixed' {
  const banglaCharacters = value.match(/\p{Script=Bengali}/gu)?.length ?? 0;
  const latinCharacters = value.match(/\p{Script=Latin}/gu)?.length ?? 0;

  if (banglaCharacters > 0 && banglaCharacters >= latinCharacters * 0.3) return 'bangla';
  if (latinCharacters > 0 && latinCharacters >= banglaCharacters * 3) return 'english';
  return 'mixed';
}
