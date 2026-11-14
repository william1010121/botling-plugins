// 離開輸入框時，把 $…$ / $$…$$ 顯示成 MathJax 產生的 SVG；文字本身不變，送出的還是 LaTeX。
import { mathjax } from "mathjax-full/js/mathjax.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { AllPackages } from "mathjax-full/js/input/tex/AllPackages.js";
import { findMathSpans } from "./mathspans";

let convert: ((tex: string, display: boolean) => string | null) | null = null;
const cache = new Map<string, string | null>();

function getConvert() {
  if (convert) return convert;
  const adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);
  const tex = new TeX({
    packages: AllPackages,
    formatError: (_jax: unknown, err: Error) => { throw err; },
  });
  const svg = new SVG({ fontCache: "none" });
  const doc = mathjax.document("", { InputJax: tex, OutputJax: svg });
  convert = (src, display) => {
    const key = (display ? "D" : "I") + src;
    if (cache.has(key)) return cache.get(key)!;
    let html: string | null = null;
    try {
      html = adaptor.outerHTML(doc.convert(src, { display }));
    } catch {
      html = null;
    }
    if (cache.size > 200) cache.clear();
    cache.set(key, html);
    return html;
  };
  return convert;
}

export function svgOnBlur(cm: { state: any; view: any }, enabled: () => boolean) {
  const { StateField, StateEffect } = cm.state;
  const { Decoration, WidgetType, EditorView } = cm.view;

  class MathWidget extends WidgetType {
    constructor(readonly html: string, readonly tex: string, readonly from: number, readonly display: boolean) { super(); }
    eq(o: MathWidget) { return o.tex === this.tex && o.display === this.display && o.from === this.from; }
    toDOM(view: any) {
      const el = document.createElement("span");
      el.className = "laas-svg";
      el.style.cssText = "display:" + (this.display ? "block;text-align:center;" : "inline-block;") + "cursor:text;color:inherit;";
      el.title = this.tex;
      el.innerHTML = this.html;
      el.addEventListener("mousedown", (e) => {
        e.preventDefault();
        view.dispatch({ selection: { anchor: this.from } });
        view.focus();
      });
      return el;
    }
    ignoreEvent() { return true; }
  }

  const setFocus = StateEffect.define();

  // 和選取範圍重疊的片段（含游標在 $…$ 裡）留原文，其餘都畫成 SVG；沒聚焦時全部都畫。
  const build = (state: any, focused: boolean) => {
    if (!enabled()) return Decoration.none;
    const doc = state.doc.toString();
    const sel = state.selection.main;
    const ranges: any[] = [];
    for (const s of findMathSpans(doc)) {
      if (focused && sel.from <= s.to && sel.to >= s.from) continue;
      const html = getConvert()(s.tex, s.display);
      if (!html) continue; // 無效的 TeX 留著原文
      ranges.push(Decoration.replace({ widget: new MathWidget(html, s.tex, s.from, s.display) }).range(s.from, s.to));
    }
    return Decoration.set(ranges);
  };

  const field = StateField.define({
    create: (state: any) => ({ focused: false, deco: build(state, false) }),
    update(value: any, tr: any) {
      let focused = value.focused;
      for (const e of tr.effects) if (e.is(setFocus)) focused = e.value;
      if (!tr.docChanged && !tr.selection && focused === value.focused) return value;
      return { focused, deco: build(tr.state, focused) };
    },
    provide: (f: any) => EditorView.decorations.from(f, (v: any) => v.deco),
  });

  const handlers = EditorView.domEventHandlers({
    blur(_e: unknown, view: any) {
      view.dispatch({ effects: setFocus.of(false) });
      return false;
    },
    focus(_e: unknown, view: any) {
      view.dispatch({ effects: setFocus.of(true) });
      return false;
    },
  });

  return [field, handlers];
}
