# chengxiaobang-skin

程小帮（Chengxiaobang）沉浸式女友皮肤，基于 [CodexGF-Live](https://github.com/zhulin025/CodexGF-Live-Releases) 官方视觉配方移植。

## 特性

- 双主题：赛博（深色）+ 暖白（浅色），跟随程小帮深浅外观自动切换
- 7 个状态视频（idle/listening/thinking/speaking/acting/approval/done），暖白主题复用映射
- 播完一轮再切，排队只留最新状态（不硬切、不闪烁）
- 官方径向 mask 羽化，女友中心清晰、边缘自然融入
- 输入框强制不透明，其他面板半透明透出女友

## 安装

### 前提
- Node.js（运行注入器）
- 程小帮桌面端已安装（默认路径 `/Applications/程小帮.app`）

### 步骤
```bash
git clone https://github.com/<你的用户名>/Codex-QQ-Skin.git
cd Codex-QQ-Skin/chengxiaobang-skin
node cxbskin.mjs --launch --inject   # 启动程小帮并注入
```

### 恢复原生界面
```bash
node cxbskin.mjs --remove
```

### 首次使用
注入后在程小帮里**点一下或打个字**（浏览器自动播放限制），之后视频正常播放。

## 目录结构

```
chengxiaobang-skin/
├── cxbskin.mjs              # 注入器（CDP 注入 CSS + 视频 + 状态机）
├── assets/
│   ├── gf-skin.css          # 赛博主题 CSS
│   ├── gf-warm.css          # 暖白主题 CSS
│   ├── themes/
│   │   ├── cyber/           # 赛博主题视频（7 个状态）
│   │   │   └── states/*.webm
│   │   └── warm-white/      # 暖白主题视频（3 个 + 复用映射）
│   │       └── states/*.webm
│   └── voice/
│       └── speaking.mp4     # 官方说话配音（保留，当前静音）
└── README.md
```

## 程小帮适配要点

以下记录程小帮 DOM 的特殊之处，给其他机器安装或二次开发时参考。

### 1. 消息区选择器
程小帮的消息滚动容器是 `.chat-scroll-area`（不是 `.latest-main-message`）。状态检测用这个元素的文字长度变化判断流式输出。

### 2. 状态检测
程小帮渲染层（`window.chengxiaobang`）**没有暴露 agent 状态 getter**，真实状态在后端。注入器用结构信号推断：
- 停止按钮出现 = 运行中（acting/thinking）
- spinner 出现 = 思考（thinking）
- 消息流式增长 = 说话（speaking）
- 输入框有内容 = 倾听（listening）
- 运行→空闲边沿 = 完成（done，持续 4 秒）
- 其余 = 待机（idle）

**不要用全文文字匹配**（会把聊天内容误判成状态）。

### 3. 输入框容器
输入框外层容器是 `.bg-card` + `.bg-popover`（含 textarea），必须强制不透明，否则会被面板半透明规则改透明。用 `:has(textarea)` 精准选中：
```css
html.cxb-gf-skin .bg-card:has(textarea),
html.cxb-gf-skin .bg-popover:has(textarea) {
  background-color: <主题底色> !important;
}
```

### 4. 主题检测
程小帮用 `document.documentElement.classList.contains("dark")` 切换深浅主题。注入器监听这个 class 变化自动切换 CSS。

### 5. 视频切换策略
- `video.loop = false`（不循环，播完触发 `ended`）
- 检测器只更新 `target`（目标状态），不直接切视频
- `ended` 事件触发切换：同状态重播，不同状态切到最新 target
- 兜底：每秒检查 `video.paused`，万一 `ended` 没触发也能推进

### 6. 面板半透明
`.bg-background`、`.bg-card`、`.bg-muted`、`.bg-sidebar`、`.bg-canvas-soft`、`.bg-canvas-soft-2`、`.bg-popover` 设为半透明（深色 `rgba(20,17,13,0.55)` / 暖白 `rgba(247,243,238,0.55)`），让女友透出。

### 7. 状态视频映射
**赛博主题**（7 个独立视频）：
| 状态 | 视频 |
|---|---|
| idle | idle.webm |
| listening | listening.webm |
| thinking | thinking.webm |
| speaking | speaking.webm |
| acting | acting.webm |
| approval | approval.webm |
| done | done.webm |

**暖白主题**（3 个视频 + 复用）：
| 状态 | 视频 |
|---|---|
| idle | idle.webm |
| listening | listening.webm |
| speaking | speaking.webm |
| thinking | → listening |
| acting | → idle |
| approval | → idle |
| done | → idle |

### 8. 官方配音
`assets/voice/speaking.mp4` 是官方说话配音（6 秒 AAC），当前静音（用户可选择恢复）。恢复方法：在 `cxbskin.mjs` 的 `switchVideo` 里，当 `s === "speaking"` 时用 `speaking.mp4` 的 data URL 并 `video.muted = false`。

## 换机器安装

```bash
git clone https://github.com/<你的用户名>/Codex-QQ-Skin.git
cd Codex-QQ-Skin/chengxiaobang-skin
node cxbskin.mjs --launch --inject
```

所有资产（视频、CSS、配音）都在仓库里，拉下来就能用。

## 修改视频映射

编辑 `cxbskin.mjs` 第 95-96 行：
```js
const CYBER_STATES = ["idle", "listening", "thinking", "speaking", "acting", "approval", "done"];
const WARM_REUSE = { idle: "idle", listening: "listening", thinking: "listening", speaking: "speaking", acting: "idle", approval: "idle", done: "idle" };
```

或替换 `assets/themes/cyber/states/*.webm` 文件（BuddyLiveGF 解包里有 20 个变体视频可选）。

## 参考

- [CodexGF-Live Releases](https://github.com/zhulin025/CodexGF-Live-Releases) — 官方皮肤（含 style-patch.json）
- [zhulin025/BuddyLiveGF](https://github.com/zhulin025/BuddyLiveGF) — WorkBuddy 女友皮肤（状态视频来源）
- [codex.liuwa.xyz](https://codex.liuwa.xyz/) — 官方演示站
