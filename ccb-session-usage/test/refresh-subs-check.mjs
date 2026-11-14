// node test/refresh-subs-check.mjs — headless Chrome, EXPANDED surface: open "Show all", scroll the list, let refresh ticks with CHANGED data run,
// and check "Show all" stays open, scroll position is kept and the numbers updated.
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import assert from "node:assert/strict"; import { dumpDom } from "./chrome.mjs";
const web = fs.readFileSync(new URL("../dist/web.js", import.meta.url), "utf8").replace(/^export /gm, "");
const html = `<!doctype html><html><body><div id="slot"></div><pre id="out"></pre><script>(async()=>{
${web}
let n=0; const items=[]; for(let i=1;i<=14;i++) items.push({id:"i"+i,name:"agent "+i,kind:"agent",model:"claude-sonnet-5-5",tokens:1000*i,cost:i/100,state:"done",turns:2});
const mk=()=>{n++; return {ok:true,follow:{mode:"following",bot:"B",engine:"claude"},engines:{claude:{state:"ok",current:true,model:"claude-sonnet-5-5",usage:{turns:1,window:200000,context:1000*n,last:{input:1,cacheRead:2,cacheWrite5m:3,cacheWrite1h:0,output:4,cost:0.01},total:{input:1,cacheRead:2,cacheWrite5m:3,cacheWrite1h:0,output:4,cost:0.5,unknownTurns:0}},
  subagents:{count:14,agents:14,workers:0,running:0,tokens:105000+n,cost:1.05+n/100,unknown:0,missing:0,replayed:0,truncated:0,items}}}};};
const root=document.getElementById("slot"); mountUsage(root,{},{surface:"expanded",interval:100,load:async()=>mk()});
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
await sleep(150);
root.querySelector(".sb-more>summary").click(); await sleep(60);
const list=root.querySelector(".sb-all"); list.scrollTop=40; const st0=list.scrollTop; const c0=root.querySelector(".ex").innerHTML;
await sleep(600);
const list2=root.querySelector(".sb-all");
document.getElementById("out").textContent=JSON.stringify({moreOpen:root.querySelector(".sb-more").open,scroll:[st0,list2&&list2.scrollTop],rows:root.querySelectorAll(".sb-all .nm").length,changed:c0!==root.querySelector(".ex").innerHTML});
})()</script></body></html>`;
const f = path.join(os.tmpdir(), "su-refresh-subs.html"); fs.writeFileSync(f, html);
const dom = dumpDom("file://" + f); const m = dom.match(/<pre id="out">(.*?)<\/pre>/s); assert.ok(m, "no output from page");
const o = JSON.parse(m[1].replace(/&quot;/g, '"')); console.log(JSON.stringify(o));
assert.equal(o.moreOpen, true, "Show all stayed open"); assert.ok(o.scroll[0] > 0 && o.scroll[0] === o.scroll[1], "scroll position kept"); assert.equal(o.rows, 9); assert.equal(o.changed, true, "numbers did update");
console.log("refresh (subagents) check passed");
