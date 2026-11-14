// Deck 輸入框的 LaTeX 自動替換（移植自 web-laas / Emacs laas）：`;a` → `\alpha`。
import { compileConfig, type Snippet } from "./engine/config";
import { findExpansion } from "./engine/matcher";
import { svgOnBlur } from "./svgblur";

export function activate(deck: any) {
  const { view: cmView } = deck.codemirror;
  const EditorView = cmView.EditorView;

  let snippets: Snippet[] = [];
  const rebuild = () => {
    const { config } = compileConfig(null, { extras: false, cdlatex: !!deck.settings.get("laas.cdlatex") });
    // 輸入框多半是一般文字：以 ; 開頭的符號在文字裡也能用，其餘（sin、xx…）只在 $…$ 數學裡用。
    const textToo = !!deck.settings.get("laas.everywhere");
    snippets = config.snippets.map((s) =>
      textToo && s.trigger !== null && s.trigger.startsWith(";") ? { ...s, mode: { ...s.mode, text: true } } : s,
    );
  };
  rebuild();
  const offCd = deck.settings.onChange("laas.cdlatex", rebuild);
  const offEv = deck.settings.onChange("laas.everywhere", rebuild);

  const handler = EditorView.inputHandler.of((view: any, from: number, to: number, text: string) => {
    if (!deck.settings.get("laas.on") || text.length !== 1 || from !== to) return false;
    const sel = view.state.selection.main;
    if (!sel.empty || sel.head !== from) return false;
    const before = view.state.doc.sliceString(0, from) + text;
    const exp = findExpansion(snippets, before, { auto: true });
    if (!exp) return false;
    const next = view.state.doc.sliceString(from, from + 1);
    const space = exp.autoSpace && next !== ")" && next !== "]" ? " " : "";
    const insert = exp.rendered.text + space;
    const stop = exp.rendered.stops[0];
    const caret = exp.from + (stop && stop.start < exp.rendered.text.length ? stop.start : insert.length);
    view.dispatch({
      changes: { from: exp.from, to: from, insert },
      selection: { anchor: caret },
      userEvent: "input.type",
    });
    return true;
  });
  const offExt = deck.composer.addExtension(handler);
  // 離開輸入框時，$…$ 顯示成 SVG 公式
  const offSvg = deck.composer.addExtension(svgOnBlur(deck.codemirror, () => !!deck.settings.get("laas.svg")));

  return () => {
    for (const off of [offCd, offEv, offExt, offSvg]) if (typeof off === "function") off();
  };
}
