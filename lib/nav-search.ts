/**
 * Ranking for the jump-to search in the student shell. Pure, so it can be tested.
 * Every word the user types must match something; better matches sort first:
 * exact name > name starts with it > a word in the name starts with it > it appears
 * in the name > a keyword matches > a small typo or a few skipped letters.
 */
export type RankableItem = { label: string; keywords?: string };

export function normalize(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Edit distance, giving up as soon as it must exceed `max`. */
export function withinEdits(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      rowMin = Math.min(rowMin, current[j]);
    }
    if (rowMin > max) return false;
    previous = current;
  }
  return previous[b.length] <= max;
}

function isSubsequence(needle: string, haystack: string): boolean {
  let index = 0;
  for (const char of haystack) if (char === needle[index]) index++;
  return index === needle.length;
}

/** How well one typed word matches an item. 0 means no match. */
function scoreToken(token: string, labelWords: string[], label: string, keywordWords: string[]): number {
  if (labelWords.some((word) => word.startsWith(token))) return 100;
  if (label.includes(token)) return 60;
  if (keywordWords.some((word) => word.startsWith(token))) return 50;
  if (token.length >= 3 && keywordWords.some((word) => word.includes(token))) return 30;
  if (token.length >= 4) {
    const allowed = token.length >= 7 ? 2 : 1;
    if ([...labelWords, ...keywordWords].some((word) => withinEdits(token, word.slice(0, token.length + 1), allowed) || withinEdits(token, word, allowed))) return 20;
  }
  if (token.length >= 3 && isSubsequence(token, label.replace(/ /g, ""))) return 10;
  return 0;
}

export function scoreItem(item: RankableItem, query: string): number {
  const tokens = normalize(query).split(" ").filter(Boolean);
  if (tokens.length === 0) return 0;
  const label = normalize(item.label);
  const labelWords = label.split(" ");
  const keywordWords = normalize(item.keywords ?? "").split(" ").filter(Boolean);
  let total = 0;
  for (const token of tokens) {
    const score = scoreToken(token, labelWords, label, keywordWords);
    if (score === 0) return 0;
    total += score;
  }
  const whole = normalize(query);
  if (label === whole) total += 200;
  else if (label.startsWith(whole)) total += 80;
  return total;
}

export function rankItems<T extends RankableItem>(items: T[], query: string, limit = 5): T[] {
  return items
    .map((item, index) => ({ item, index, score: scoreItem(item, query) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.item);
}
