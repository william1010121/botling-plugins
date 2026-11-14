// 找出文字裡的 $…$ 與 $$…$$ 數學片段；\$ 不算，空的或沒收尾的略過。
export interface MathSpan { from: number; to: number; tex: string; display: boolean }

export function findMathSpans(text: string): MathSpan[] {
  const spans: MathSpan[] = [];
  let i = 0;
  const closeAt = (start: number, delim: string): number => {
    for (let j = start; j < text.length; j++) {
      if (text[j] === "\\") { j++; continue; }
      if (text.startsWith(delim, j)) return j;
    }
    return -1;
  };
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\\") { i += 2; continue; }
    if (ch !== "$") { i++; continue; }
    const display = text.startsWith("$$", i);
    const delim = display ? "$$" : "$";
    const end = closeAt(i + delim.length, delim);
    if (end < 0) { i += delim.length; continue; }
    const tex = text.slice(i + delim.length, end);
    if (!tex.trim() || (!display && tex.includes("\n\n"))) { i += delim.length; continue; }
    spans.push({ from: i, to: end + delim.length, tex, display });
    i = end + delim.length;
  }
  return spans;
}
