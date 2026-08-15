#!/bin/bash
# apply.sh — 一键应用程小帮「赛博女友」皮肤
# 流程：退出程小帮 → 调试端口启动 → 注入皮肤 → 截图验证
set -euo pipefail
cd "$(dirname "$0")"

echo "==> 1/4 退出当前程小帮（如已在运行）"
osascript -e 'tell application "程小帮" to quit' 2>/dev/null || true
sleep 2
pkill -f "/Applications/程小帮.app/Contents/MacOS/程小帮" 2>/dev/null || true
sleep 1

echo "==> 2/4 以调试端口 9229 启动程小帮"
node cxbskin.mjs --launch
sleep 6   # 等首屏就绪

echo "==> 3/4 注入赛博女友皮肤"
node cxbskin.mjs --inject

echo "==> 4/4 截图验证"
node cxbskin.mjs --shot shot.png
echo "完成。截图: $(pwd)/shot.png"
echo "恢复原生界面: node cxbskin.mjs --remove"
