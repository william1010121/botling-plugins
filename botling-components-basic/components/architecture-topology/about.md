Interactive 2D swimlane architecture topology diagram with automatic orthogonal SVG wire routing, flow animation, and click-to-drill-down component inspector. Show it with `<show name="architecture-topology">JSON</show>`.
Sizes: 2x2, 3x2, 3x3
Icon: point.3.connected.trianglepath.dotted

## How it works

Bots only supply a declarative JSON object (`layers`, `nodes`, `edges`) without calculating any SVG coordinates (`x`, `y`). The component automatically:
1. Lays out horizontal swimlanes (`layers`) with top-mounted pill badges so headers never overlap node cards.
2. Spaces node cards across each swimlane proportionally by `span` (default `1`), highlighting `hub: true` nodes with an electric-blue focus border.
3. Routes orthogonal 90-degree SVG connectors (`edges`) with pill-masked edge labels and animated data-flow pulses.
4. Binds interactive click handlers: clicking any node highlights all connected edges/neighbors and expands its `subcomponents` and source file paths (`code`) in the bottom inspector panel.

If `{}` is passed, it renders the complete Botling 2.0 system architecture topology by default.

## Data format (`window.ccb.data`)

```json
{
  "title": "Botling 2.0 系統架構拓撲圖",
  "subtitle": "點擊任一節點高亮關聯通訊線路並展開內部原始碼細節",
  "layers": [
    { "id": "l1", "title": "01 · 介面與雙軌渲染層 (CLIENT & PRESENTATION)" },
    { "id": "l2", "title": "02 · 核心調度與守護中樞 (CORE SUPERVISOR HUB)" }
  ],
  "nodes": [
    {
      "id": "desktop-ui",
      "layer": "l1",
      "span": 2,
      "title": "🖥️ macOS Electron 桌面端 + 雙軌沙盒呈現層",
      "tag": "Dual-Surface UI",
      "subtitle": "ChatFrame 沙盒 ＋ NativeEditorView 原生輸入法浮層",
      "meta": "左側欄 Bot 清單 · Whiteboard · ReportViewer",
      "desc": "將對話渲染隔離於安全沙盒 iframe，同時以獨立 WebContentsView 承載原生輸入框。",
      "subcomponents": [
        {
          "name": "NativeEditorView",
          "code": "desktop/src/main/editor-host.ts",
          "body": "獨立掛載的 WebContentsView 浮層，確保 macOS 中文輸入零延遲。"
        }
      ]
    },
    {
      "id": "core-server",
      "layer": "l2",
      "span": 2,
      "hub": true,
      "title": "🧠 Core Server",
      "tag": "CENTRAL BRAIN",
      "subtitle": "Bot 生命週期 · Conductor 多頭仲裁",
      "meta": "支援 Core Swap 零中斷熱升級"
    }
  ],
  "edges": [
    { "from": "desktop-ui", "to": "core-server", "label": "Protocol v10 IPC", "kind": "core" }
  ]
}
```
