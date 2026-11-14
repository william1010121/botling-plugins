// node test/refresh-check.mjs — headless Chrome, EXPANDED surface: let refresh ticks with CHANGED data run, check the tab stays, the DOM node of
// the card is never replaced when the data is identical, and numbers update when it changes. Also: placeholder is drawn before data arrives.
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import assert from "node:assert/strict"; import { dumpDom } from "./chrome.mjs";
const web = fs.readFileSync(new URL("../dist/web.js", import.meta.url), "utf8").replace(/^export /gm, "");
const html = `<!doctype html><html><body><div id="slot"></div><pre id="out"></pre><script>(async()=>{
${web}
let n=0, same=false; const eng=(c)=>({state:"ok",current:true,model:"m",usage:{turns:1,window:200000,context:c,last:{input:1,cacheRead:2,cacheWrite5m:3,cacheWrite1h:0,output:4,cost:0.01},total:{input:1,cacheRead:2,cacheWrite5m:3,cacheWrite1h:0,output:4,cost:0.5,unknownTurns:0}}});
const mk=()=>({ok:true,follow:{mode:"following",bot:"B",engine:"claude"},engines:{claude:eng(same?5000:1000*(++n)),codex:{state:"none",reason:"x"},agy:{state:"none",reason:"x"}}});
const root=document.getElementById("slot");
const calls=[]; const ccb={host:{call:async()=>{calls.push(1);return mk();}}};
const off=mountUsage(root,ccb,{surface:"expanded",interval:100});
const placeholder=root.querySelector(".ex").textContent.trim();
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
await sleep(150);
root.querySelector('[data-tab="codex"]').click(); const tabAfterClick=root.querySelector(".ex-tab.on").dataset.tab;
const before=root.querySelector(".ex-tabs");
await sleep(450);
const tabKept=root.querySelector(".ex-tab.on").dataset.tab;
same=true; await sleep(250); const node1=root.querySelector(".ex-tabs"); await sleep(350); const node2=root.querySelector(".ex-tabs");
root.querySelector('[data-tab="claude"]').click();
const ctx=root.querySelector(".uc-cx span").textContent;
const n0=calls.length; off(); await sleep(350);
document.getElementById("out").textContent=JSON.stringify({placeholder,tabAfterClick,tabKept,nodeStable:node1===node2,ticks:n0>=4,stopped:calls.length===n0,ctx});
})()</script></body></html>`;
const f = path.join(os.tmpdir(), "su-refresh.html"); fs.writeFileSync(f, html);
const dom = dumpDom("file://" + f); const m = dom.match(/<pre id="out">(.*?)<\/pre>/s); assert.ok(m, "no output from page");
const o = JSON.parse(m[1].replace(/&quot;/g, '"')); console.log(JSON.stringify(o));
assert.equal(o.placeholder, "Loading usage…"); assert.equal(o.tabAfterClick, "codex"); assert.equal(o.tabKept, "codex", "chosen tab survives refresh ticks");
assert.equal(o.nodeStable, true, "identical data: DOM not rewritten"); assert.equal(o.ticks, true); assert.equal(o.stopped, true, "dispose stops the timer"); assert.match(o.ctx, /5,000/);
console.log("refresh check passed");
