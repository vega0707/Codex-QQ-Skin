#!/usr/bin/env node
/**
 * cxbskin.mjs — 程小帮「赛博女友」皮肤注入器
 *
 * 原理（参照 Codex-QQ-Skin / heige-codex-skin-studio）：通过 Chromium DevTools Protocol
 * 往程小帮（Electron）渲染进程注入皮肤 CSS + 角色立绘，零修改应用本体（不动 app.asar/签名）。
 *
 * 用法：
 *   node cxbskin.mjs --launch          以调试端口启动程小帮（若已在运行会提示）
 *   node cxbskin.mjs --inject          连接已启动的程小帮并注入皮肤
 *   node cxbskin.mjs --launch --inject 启动并注入（一步到位）
 *   node cxbskin.mjs --remove          移除皮肤（恢复原生界面）
 *   node cxbskin.mjs --shot <out.png>  截图当前主窗口
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.CXB_GF_PORT || 9229);
const APP_EXE = process.env.CXB_GF_APP || "/Applications/程小帮.app/Contents/MacOS/程小帮";
const PORTRAIT = path.join(HERE, "assets", "gf-portrait.png");
const SKIN_CSS = path.join(HERE, "assets", "gf-skin.css");

const args = process.argv.slice(2);
const mode = args.includes("--launch") && args.includes("--inject") ? "launch-inject"
  : args.includes("--launch") ? "launch"
  : args.includes("--inject") ? "inject"
  : args.includes("--remove") ? "remove"
  : args.includes("--shot") ? "shot"
  : "help";

const shotOut = args[args.indexOf("--shot") + 1] || path.join(HERE, "shot.png");

/* ---------------- CDP 基础 ---------------- */

async function listPageTargets() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`, { redirect: "error" });
  if (!res.ok) throw new Error(`CDP /json/list HTTP ${res.status}`);
  const list = await res.json();
  return (Array.isArray(list) ? list : []).filter((t) => t.type === "page");
}

async function waitForMainTarget(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      const targets = await listPageTargets();
      // 主窗口：index.html（title 程小帮）；优先排除 floating-ball / mini-chat
      const main = targets.find((t) => t.url.includes("index.html")) ||
        targets.find((t) => /程小帮/.test(t.title || "")) || targets[0];
      if (main) return main;
    } catch (e) { lastErr = e; }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`未找到程小帮主窗口（${timeoutMs}ms）: ${lastErr?.message || "targets 为空"}`);
}

class Cdp {
  constructor(wsUrl) { this.ws = new WebSocket(wsUrl); this.id = 0; this.pending = new Map(); }
  async open() {
    await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error("CDP ws open 超时")), 5000);
      this.ws.addEventListener("open", () => { clearTimeout(t); res(); }, { once: true });
      this.ws.addEventListener("error", () => { clearTimeout(t); rej(new Error("CDP ws 连接失败")); }, { once: true });
    });
    this.ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(String(ev.data));
      const w = this.pending.get(msg.id);
      if (!w) return;
      this.pending.delete(msg.id);
      msg.error ? w.reject(new Error(msg.error.message)) : w.resolve(msg.result);
    });
  }
  send(method, params = {}, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      const t = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP 超时: ${method}`)); }, timeoutMs);
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const r = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result?.value;
  }
  close() { try { this.ws.close(); } catch {} }
}

/* ---------------- 皮肤载荷 ---------------- */

const CYBER_STATES = ["idle", "listening", "thinking", "speaking", "acting", "approval", "done"];
const WARM_REUSE = { idle: "idle", listening: "listening", thinking: "listening", speaking: "speaking", acting: "idle", approval: "idle", done: "idle" };

function readVideo(dir, state) {
  return "data:video/webm;base64," + fs.readFileSync(path.join(dir, state + ".webm")).toString("base64");
}

function buildPayload() {
  const cyberCss = fs.readFileSync(path.join(HERE, "assets", "gf-skin.css"), "utf8");
  const warmCss = fs.readFileSync(path.join(HERE, "assets", "gf-warm.css"), "utf8");

  const cyberDir = path.join(HERE, "assets", "themes", "cyber", "states");
  const warmDir = path.join(HERE, "assets", "themes", "warm-white", "states");
  const cyberVideos = {};
  for (const s of CYBER_STATES) cyberVideos[s] = readVideo(cyberDir, s);
  const warmBase = { idle: readVideo(warmDir, "idle"), listening: readVideo(warmDir, "listening"), speaking: readVideo(warmDir, "speaking") };
  const warmVideos = {};
  for (const s of CYBER_STATES) warmVideos[s] = warmBase[WARM_REUSE[s]];

  const payload = `(() => {
    const KEY = "__CXB_GF_SKIN__";
    if (window[KEY]) return "already";
    const THEMES = ${JSON.stringify({ cyber: { css: cyberCss, videos: cyberVideos }, warm: { css: warmCss, videos: warmVideos } })};

    // 注入样式（随主题切换）
    const style = document.createElement("style");
    style.id = "cxb-gf-style-host";
    (document.head || document.documentElement).appendChild(style);

    // 动态女友视频层（右侧大背景，沉底，随状态切换）
    const video = document.createElement("video");
    video.id = "cxb-gf-live";
    video.muted = true;
    video.loop = false; // 不循环，播完一轮触发 ended，由 advance() 决定重播/切换
    video.autoplay = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    document.body.appendChild(video);

    // 女友上方渐变遮罩（保证左侧 UI 可读）
    const veil = document.createElement("div");
    veil.id = "cxb-gf-veil";
    document.body.appendChild(veil);

    // ---- 主题管理：跟随程小帮深浅外观 ----
    let theme = "cyber";
    const detectTheme = () => document.documentElement.classList.contains("dark") ? "cyber" : "warm";
    const applyTheme = (t) => {
      theme = t;
      style.textContent = THEMES[t].css;
      switchVideo("idle");
    };
    new MutationObserver(() => {
      const t = detectTheme();
      if (t !== theme) { applyTheme(t); setTarget("idle"); }
    }).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    // ---- 状态机：检测程小帮任务状态，切换视频（全部静音） ----
    // 只用结构信号（停止按钮/spinner/流式/输入框），不用全文文字匹配——
    // 全文匹配会把聊天内容里的词（"等待确认""全部完成"）误判成状态。
    // 只用结构信号（停止按钮/spinner/流式/输入框），不用全文文字匹配——
    // 全文匹配会把聊天内容里的词（"等待确认""全部完成"）误判成状态。
    //
    // 切换策略：不硬切。detect 只更新「目标状态」，当前视频**播完一轮(ended)**后才切，
    // 且切换时始终用最新的目标状态（中间变化被跳过，不排队积压）。
    let cur = "idle";
    let target = "idle";
    let lastMsgLen = 0;
    let wasRunning = false;
    let doneUntil = 0;
    const switchVideo = (s) => {
      cur = s;
      video.src = THEMES[theme].videos[s] || THEMES[theme].videos.idle;
      video.muted = true;
      video.play().catch(() => {});
    };
    const setTarget = (s) => { target = s; };
    const advance = () => {
      if (target === cur) { video.play().catch(() => {}); return; } // 同状态：重新播（循环）
      switchVideo(target);                                         // 不同状态：切到最新目标
    };
    video.addEventListener("ended", advance);
    // 兜底：万一 ended 不触发（如 data URL 异常），每秒检查一次是否该切
    if (window.__CXB_GF_ADVANCE__) clearInterval(window.__CXB_GF_ADVANCE__);
    window.__CXB_GF_ADVANCE__ = setInterval(() => { if (video.paused) advance(); }, 1000);
    const detect = () => {
      try {
        const ae = document.activeElement;
        const typing = ae && (ae.tagName === "TEXTAREA" || ae.tagName === "INPUT") && (ae.value || "").length > 0;
        const msg = document.querySelector(".chat-scroll-area") || document.querySelector(".latest-main-message");
        const msgLen = msg ? msg.innerText.length : 0;
        const streaming = msgLen > lastMsgLen + 2;
        lastMsgLen = msgLen;

        // 结构信号
        const hasStop = !!document.querySelector('button[aria-label*="停止"],button[aria-label*="中断"],button[aria-label*="stop" i]');
        const hasSpinner = !!document.querySelector('[class*="animate-spin"],[class*="spinner"],[data-testid*="think"]');
        // 授权卡片：只认"可见的确认/授权弹窗按钮"，不匹配全文
        const hasApproval = !!document.querySelector('[role="dialog"] button[aria-label*="允许"], [role="dialog"] button[aria-label*="批准"], [role="dialog"] button[aria-label*="授权"], [class*="approval"], [class*="permission"]');

        const running = hasStop || hasSpinner || streaming;
        if (running) {
          wasRunning = true;
          if (hasApproval) return setTarget("approval");
          if (streaming) return setTarget("speaking");
          if (hasSpinner) return setTarget("thinking");
          return setTarget("acting");
        }
        // 刚停止（运行→空闲）：短暂显示 done
        if (wasRunning) {
          wasRunning = false;
          doneUntil = Date.now() + 4000;
        }
        if (Date.now() < doneUntil) return setTarget("done");
        if (typing) return setTarget("listening");
        return setTarget("idle");
      } catch { /* ignore */ }
    };
    // 激活皮肤类
    document.documentElement.classList.add("cxb-gf-skin");

    // 初始应用主题（须在 fadeVideo 定义后调用）
    applyTheme(detectTheme());

    // 启动状态机（先清旧定时器，防止重复注入导致多路并发念多遍）
    if (window.__CXB_GF_TIMER__) clearInterval(window.__CXB_GF_TIMER__);
    window.__CXB_GF_TIMER__ = setInterval(detect, 800);

    window[KEY] = true;
    return "injected:" + theme;
  })()`;
  return payload;
}

function buildRemoveScript() {
  return `(() => {
    if (window.__CXB_GF_TIMER__) { clearInterval(window.__CXB_GF_TIMER__); window.__CXB_GF_TIMER__ = null; }
    document.getElementById("cxb-gf-style-host")?.remove();
    document.getElementById("cxb-gf-background")?.remove();
    document.getElementById("cxb-gf-live")?.remove();
    document.getElementById("cxb-gf-veil")?.remove();
    document.documentElement.classList.remove("cxb-gf-skin");
    document.documentElement.style.removeProperty("--gf-portrait");
    delete window.__CXB_GF_SKIN__;
    return "removed";
  })()`;
}

/* ---------------- 主流程 ---------------- */

async function connect() {
  const target = await waitForMainTarget();
  const cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.open();
  await cdp.send("Runtime.enable");
  await cdp.send("Page.enable");
  return { cdp, target };
}

async function ensureDebugPort() {
  try { await fetch(`http://127.0.0.1:${PORT}/json/version`, { redirect: "error" }); return true; }
  catch { return false; }
}

async function launchApp() {
  if (await ensureDebugPort()) {
    console.log(`端口 ${PORT} 已有 CDP 服务（程小帮已在调试模式运行）。`);
    return;
  }
  const child = spawn(APP_EXE, [`--remote-debugging-port=${PORT}`], {
    detached: true, stdio: "ignore",
  });
  child.unref();
  console.log(`已启动: ${APP_EXE} --remote-debugging-port=${PORT}`);
  console.log("注意：若程小帮此前已在运行（无调试端口），需要先完全退出再启动本脚本。");
}

async function inject() {
  const { cdp, target } = await connect();
  try {
    const r = await cdp.eval(buildPayload());
    console.log(`注入完成: ${r} (target: ${target.title || target.url})`);
  } finally { cdp.close(); }
}

async function remove() {
  const { cdp, target } = await connect();
  try {
    const r = await cdp.eval(buildRemoveScript());
    console.log(`已恢复: ${r}`);
  } finally { cdp.close(); }
}

async function shot() {
  const { cdp } = await connect();
  try {
    // 先确保皮肤已注入（幂等）
    await cdp.eval(buildPayload()).catch(() => {});
    await new Promise((r) => setTimeout(r, 600));
    const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(shotOut, Buffer.from(data, "base64"));
    console.log(`截图已保存: ${shotOut}`);
  } finally { cdp.close(); }
}

/* ---------------- 入口 ---------------- */

(async () => {
  try {
    switch (mode) {
      case "launch": await launchApp(); break;
      case "inject": await inject(); break;
      case "launch-inject": await launchApp(); await inject(); break;
      case "remove": await remove(); break;
      case "shot": await shot(); break;
      default:
        console.log(`cxbskin — 程小帮赛博女友皮肤注入器
用法:
  node cxbskin.mjs --launch           以调试端口启动程小帮
  node cxbskin.mjs --inject           注入皮肤
  node cxbskin.mjs --launch --inject  启动并注入
  node cxbskin.mjs --remove           移除皮肤
  node cxbskin.mjs --shot out.png     截图主窗口`);
    }
  } catch (e) {
    console.error(`[cxbskin] ${e.message}`);
    process.exitCode = 1;
  }
})();
