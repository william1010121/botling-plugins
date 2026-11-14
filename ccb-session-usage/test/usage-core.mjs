// Pure logic: price table + transcript parsing. Edit PRICES to change prices.
// USD per million tokens (API list price). cacheRead may be omitted = 10% of input.
// cache write: 1.25x input (5m), 2x input (1h).
export const PRICES = {
  "opus-5-5": { label: "Opus 5.5", input: 4, output: 20, cacheRead: 0.2 },
  "sonnet-5-5": { label: "Sonnet 5.5", input: 2, output: 10, cacheRead: 0.2 },
  "haiku-5-5": { label: "Haiku 5.5", input: 0.1, output: 0.5 },
};

export function priceFor(model) {
  const m = String(model || "").toLowerCase();
  for (const key of Object.keys(PRICES)) if (m.includes(key)) return { key, ...PRICES[key] };
  return null;
}

export function costOf(u, price) {
  if (!price) return null;
  const cr = price.cacheRead ?? price.input * 0.1;
  return (u.input * price.input + u.output * price.output + u.cacheRead * cr +
    u.cacheWrite5m * price.input * 1.25 + u.cacheWrite1h * price.input * 2) / 1e6;
}

export function parseTranscript(text) {
  const seen = new Map(); // dedupe key -> turn (last wins)
  let n = 0;
  for (const line of String(text || "").split("\n")) {
    if (!line.trim()) continue;
    let d; try { d = JSON.parse(line); } catch { continue; }
    const m = d && d.message;
    if (d.type !== "assistant" || !m || !m.usage) continue;
    const us = m.usage, cc = us.cache_creation || {};
    const w = us.cache_creation_input_tokens || 0;
    const w5 = cc.ephemeral_5m_input_tokens, w1 = cc.ephemeral_1h_input_tokens;
    const split = w5 != null || w1 != null;
    const turn = {
      model: m.model || "",
      input: us.input_tokens || 0, output: us.output_tokens || 0,
      cacheRead: us.cache_read_input_tokens || 0,
      cacheWrite5m: split ? (w5 || 0) : w, cacheWrite1h: split ? (w1 || 0) : 0,
      time: d.timestamp || null,
    };
    if (m.model === "<synthetic>") continue;
    const key = m.id || d.requestId || d.uuid || "n" + n++;
    if (seen.has(key)) seen.delete(key); // keep order of last occurrence
    seen.set(key, turn);
  }
  const turns = [...seen.values()];
  const total = { input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0, cost: 0, unknownTurns: 0, unknownModels: [] };
  for (const t of turns) {
    total.input += t.input; total.output += t.output; total.cacheRead += t.cacheRead;
    total.cacheWrite5m += t.cacheWrite5m; total.cacheWrite1h += t.cacheWrite1h;
    const c = costOf(t, priceFor(t.model));
    t.cost = c;
    if (c == null) { total.unknownTurns++; if (!total.unknownModels.includes(t.model)) total.unknownModels.push(t.model); }
    else total.cost += c;
  }
  const last = turns[turns.length - 1] || null;
  return {
    turns: turns.length, last, total,
    context: last ? last.input + last.cacheRead + last.cacheWrite5m + last.cacheWrite1h : 0,
  };
}

// ===================== Codex (OpenAI) =====================
// CODEX PRICE TABLE — edit here. USD per million tokens, OpenAI API standard tier.
// Source: https://developers.openai.com/api/docs/pricing (checked 2026-11-05).
// `long` applies to a request whose input exceeds 272,000 tokens. cacheWrite = 30-minute rate.
// Models not listed here are shown as "price unknown" (never guessed).
export const CODEX_PRICES = {
  "gpt-6-astra":   { label: "GPT-6 Astra",   input: 10,  cached: 1,    cacheWrite: 12.5,  output: 50, long: { input: 20,  cached: 2,    cacheWrite: 25,   output: 75 } },
  "gpt-6.1-sol":   { label: "GPT-6.1 Sol",   input: 2,   cached: 0.1,  cacheWrite: 2.5,   output: 10, long: { input: 4,   cached: 0.2,  cacheWrite: 5,    output: 15 } },
  "gpt-6.1-terra": { label: "GPT-6.1 Terra", input: 1,   cached: 0.05, cacheWrite: 1.25,  output: 5,  long: { input: 2,   cached: 0.1,  cacheWrite: 2.5,  output: 7.5 } },
  "gpt-6-luna":    { label: "GPT-6 Luna",    input: 0.1, cached: 0.01, cacheWrite: 0.125, output: 0.5, long: { input: 0.2, cached: 0.02, cacheWrite: 0.25, output: 0.75 } },
};
export const CODEX_LONG_CONTEXT = 272000;

export function codexPriceFor(model) {
  const m = String(model || "").toLowerCase();
  return CODEX_PRICES[m] ? { key: m, ...CODEX_PRICES[m] } : null; // exact match only
}

// Codex input_tokens INCLUDES cached (and cache-write) tokens; output_tokens INCLUDES reasoning.
export function codexCostOf(t, price) {
  if (!price) return null;
  const p = t.input > CODEX_LONG_CONTEXT ? price.long : price;
  const fresh = Math.max(0, t.input - t.cacheRead - t.cacheWrite);
  return (fresh * p.input + t.cacheRead * p.cached + t.cacheWrite * p.cacheWrite + t.output * p.output) / 1e6;
}

export function parseCodex(text) {
  let model = "", prev = null, window = 0;
  const turns = [];
  for (const line of String(text || "").split("\n")) {
    if (!line.trim()) continue;
    if (!line.includes('"turn_context"') && !line.includes('"token_count"')) continue;
    let d; try { d = JSON.parse(line); } catch { continue; }
    const p = d && d.payload;
    if (!p) continue;
    if (d.type === "turn_context") { if (p.model) model = p.model; continue; }
    if (d.type !== "event_msg" || p.type !== "token_count" || !p.info) continue;
    const tot = p.info.total_token_usage, u = p.info.last_token_usage;
    if (!tot || !u) continue;
    const sig = JSON.stringify(tot);
    if (sig === prev) continue; // Codex repeats token_count events
    prev = sig;
    if (p.info.model_context_window) window = p.info.model_context_window;
    turns.push({
      model, input: u.input_tokens || 0, cacheRead: u.cached_input_tokens || 0,
      cacheWrite: u.cache_write_input_tokens || 0, output: u.output_tokens || 0,
      reasoning: u.reasoning_output_tokens || 0, time: d.timestamp || null,
    });
  }
  const total = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0, cost: 0, unknownTurns: 0, unknownModels: [] };
  for (const t of turns) {
    total.input += t.input; total.cacheRead += t.cacheRead; total.cacheWrite += t.cacheWrite;
    total.output += t.output; total.reasoning += t.reasoning;
    const c = codexCostOf(t, codexPriceFor(t.model));
    t.cost = c;
    if (c == null) { total.unknownTurns++; if (!total.unknownModels.includes(t.model)) total.unknownModels.push(t.model); }
    else total.cost += c;
  }
  const last = turns[turns.length - 1] || null;
  return { turns: turns.length, last, total, context: last ? last.input : 0, window };
}
