# chengxiaobang-skin — 程小帮「赛博女友」皮肤（本仓扩展）

给程小帮桌面端（Electron）注入赛博女友皮肤的子项目，**零修改应用本体**（不动 app.asar / 签名），可一键恢复。

## 原理

参照本仓库（Codex-QQ-Skin）与 BuddyLiveGF 的机制：以 `--remote-debugging-port` 启动宿主
Electron 应用，经 Chromium DevTools Protocol 的 `Runtime.evaluate` 注入 CSS + 立绘
（dataURL），`pointer-events:none` 保证不挡操作。

## 文件

| 文件 | 作用 |
|---|---|
| `cxbskin.mjs` | 注入器：`--launch` 启动 / `--inject` 注入 / `--remove` 恢复 / `--shot` 截图 |
| `apply.sh` | 一键应用（退出 → 重启 → 注入 → 截图） |
| `assets/gf-portrait.png` | 赛博女友立绘（BuddyLiveGF 原版素材） |
| `assets/gf-background.png` | 背景层 |
| `assets/gf-skin.css` | 皮肤样式（基于 BuddyLiveGF object-live.css 适配程小帮 DOM） |

## 用法

```bash
cd chengxiaobang-skin
./apply.sh                    # 一键应用皮肤（会重启程小帮）
node cxbskin.mjs --remove     # 恢复原生界面
node cxbskin.mjs --shot out.png  # 截图
```

## 说明

- 立绘/背景素材来自 BuddyLiveGF（zhulin025），仅限个人使用
- 程小帮更新后 DOM 变化可能需要微调 `gf-skin.css`
- 注入仅监听 `127.0.0.1` 调试端口，不写入官方安装目录
