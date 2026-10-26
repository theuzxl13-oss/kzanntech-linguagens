/** Diferença caractere a caractere (LCS) para destacar erros na interface. */
export type DiffPart = { type: "same" | "added" | "removed"; text: string };

export function charDiff(actual: string, expected: string): DiffPart[] {
  const a = [...actual];
  const b = [...expected];
  if (a.length * b.length > 40_000) return [{ type: "removed", text: actual }, { type: "added", text: expected }];
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      dp[i][j] = a[i].toLowerCase() === b[j].toLowerCase() ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const parts: DiffPart[] = [];
  const push = (type: DiffPart["type"], ch: string) => {
    const last = parts[parts.length - 1];
    if (last && last.type === type) last.text += ch;
    else parts.push({ type, text: ch });
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i].toLowerCase() === b[j].toLowerCase()) {
      push("same", b[j]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) push("removed", a[i++]);
    else push("added", b[j++]);
  }
  while (i < a.length) push("removed", a[i++]);
  while (j < b.length) push("added", b[j++]);
  return parts;
}
