# ClawBar — Agent Development Prompt

> 本文档是精化后的 agent prompt，确保任何 AI coding agent 阅读本文档后能直接上手开发和维护 ClawBar 项目。

---

## 你正在开发的项目

**ClawBar** 是一个 macOS menu bar 聊天客户端，让用户通过 menu bar 图标一键唤起浮动聊天窗口，与自部署的 OpenClaw（龙虾）AI 实例对话。

**核心特性**:
- macOS menu bar 图标，点击弹出/隐藏聊天窗口
- 自定义聊天 UI（消息气泡、Markdown 渲染、代码高亮）
- 窗口可 resize/拖拽/pin（置顶）
- 通过 OpenClaw CLI 与本地 OpenClaw 实例通信
- 亮色/暗色主题，跟随系统

---

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Electron | 35+ | 桌面应用框架（main + renderer 双进程） |
| React | 19 | UI 框架 |
| TypeScript | 5.7+ | 全栈类型安全 |
| Vite | 6+ | 前端构建（渲染进程） |
| Tailwind CSS | 3 | 样式（utility-first，配合 CSS 变量） |
| Zustand | 5 | 状态管理 |
| electron-builder | 26+ | macOS DMG 打包 |

---

## 项目结构

```
clawbar/
├── electron/                # Electron 主进程 (TypeScript → CJS via tsc)
│   ├── main.ts              # 应用入口：app lifecycle, tray, window creation
│   ├── preload.ts           # contextBridge: 暴露 window.electronAPI
│   └── ipc/
│       ├── openclaw.ts      # OpenClaw CLI 连接检测 + Agent 列表
│       ├── sessions.ts      # Session CRUD + Transcript 读取 + 消息发送
│       └── settings.ts      # 设置持久化 (~/.clawbar/settings.json)
├── src/                     # React 渲染进程
│   ├── main.tsx             # React 入口
│   ├── App.tsx              # 根组件: TitleBar + ChatPanel/SettingsPanel
│   ├── components/
│   │   ├── TitleBar.tsx     # 标题栏: 拖拽区域、Agent 下拉、Pin、设置按钮
│   │   ├── ChatPanel.tsx    # 聊天面板 (MessageList + ChatInput)
│   │   ├── MessageList.tsx  # 消息列表: 自动滚动、空状态
│   │   ├── MessageBubble.tsx# 消息气泡: Markdown 渲染、代码高亮、Copy 按钮
│   │   ├── ChatInput.tsx    # 输入框: auto-resize, Enter 发送, Shift+Enter 换行
│   │   ├── TypingIndicator.tsx # 打字动画 (三点跳动)
│   │   ├── SessionSwitcher.tsx # 会话列表 + 新建会话
│   │   └── SettingsPanel.tsx # 设置面板 (CLI 路径、主题、行为)
│   ├── stores/
│   │   ├── chatStore.ts     # Zustand: 消息、会话、Agent、连接状态、轮询
│   │   └── settingsStore.ts # Zustand: 设置 + 主题解析
│   ├── types/index.ts       # 共享类型: Message, Session, Agent, Settings
│   └── styles/globals.css   # CSS 变量 (Design Tokens) + Tailwind + 全局样式
├── types/electron.d.ts      # window.electronAPI 类型声明
├── resources/               # Tray 图标 (PNG template images)
├── docs/                    # PRD, DESIGN, ARCHITECTURE, TEST-PLAN
├── package.json
├── vite.config.ts           # Vite 配置 (渲染进程)
├── tsconfig.json            # TypeScript 配置 (渲染进程)
├── tsconfig.node.json       # TypeScript 配置 (主进程 → CJS)
├── tailwind.config.js
├── postcss.config.js
└── electron-builder.yml     # DMG 打包配置
```

---

## 关键架构决策

### 1. IPC 通信

所有主进程 ↔ 渲染进程通信通过 `contextBridge` + `ipcRenderer.invoke/send`：

```
渲染进程 → window.electronAPI.openclaw.sendMessage(...)
    ↓ ipcRenderer.invoke('openclaw:send-message', ...)
主进程 → ipcMain.handle('openclaw:send-message', handler)
    ↓ spawn('openclaw', [...args])
OpenClaw CLI
```

Channel 命名: `domain:action`（如 `openclaw:get-agents`, `settings:set`）

### 2. OpenClaw 通信

**本地 CLI 模式**（当前唯一支持的模式）:
- 通过 `child_process.spawn` 调用 `openclaw` CLI
- 始终传 `--no-color` 和环境变量 `NO_COLOR=1`
- 用 `--json` flag 获取结构化输出
- 参数作为数组传递（防注入），不用 `exec`

**关键 CLI 命令**:
```bash
openclaw --version                                    # 检测连接
openclaw sessions --all-agents --json                 # 列出所有 session
openclaw sessions create --agent <id> --json          # 创建 session
openclaw agent --agent <id> --session-id <uuid> --message <text>  # 发送消息（异步）
```

**Transcript 读取**: 直接从文件系统读取 JSONL 文件
- 路径: `~/.openclaw/agents/<agentId>/sessions/sessions.json` → 索引文件
- 格式: `{"type":"message","message":{"role":"user","content":"..."},"timestamp":"..."}`
- 发送消息后启动 1s 轮询，5s 无变化后停止

### 3. 窗口管理

- `frame: false` — 无边框窗口
- `vibrancy: 'popover'` — macOS 毛玻璃效果
- `skipTaskbar: true` — 不在 Dock 显示
- `alwaysOnTop` — 通过 Pin 按钮切换
- 位置: 首次在 Tray 图标正下方，拖拽后记住位置

### 4. 样式系统

**禁止硬编码颜色**。所有颜色通过 CSS 变量引用:
```css
/* 使用 */
background-color: var(--color-surface-user-bubble);
color: var(--color-text-primary);

/* 暗色适配: 只需切换 data-theme 属性 */
document.documentElement.setAttribute('data-theme', 'dark');
```

Design Tokens 定义在 `docs/design-tokens.json`，CSS 变量在 `src/styles/globals.css`。

---

## 常用开发命令

```bash
npm run dev           # 启动 Vite dev server（仅渲染进程）
npm run build:electron # 编译 electron/ → dist-electron/
npm run dev:electron  # 编译主进程 + 启动 Electron app
npm run build         # 生产构建（Vite + tsc）
npm run pack:mac:dmg:arm64  # 打包 macOS DMG (Apple Silicon)
npx tsc --noEmit      # 渲染进程类型检查
npx tsc -p tsconfig.node.json --noEmit  # 主进程类型检查
```

---

## 开发规范

1. **新增 IPC 通道**: 在 `electron/ipc/` 对应文件添加 handler → 在 `electron/preload.ts` 暴露 → 在 `types/electron.d.ts` 添加类型
2. **新增组件**: 在 `src/components/` 创建，使用函数组件 + hooks
3. **状态管理**: 通过 Zustand store，不用 React Context
4. **主题色**: 只用 CSS 变量，不硬编码颜色
5. **安全**: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`
6. **CLI 调用**: 永远用 `spawn`（非 `exec`），参数数组传递
7. **路径安全**: 文件系统操作限制在 `~/.openclaw/` 内，validate 所有路径

---

## 当前状态

已完成:
- ✅ 项目骨架（Electron + React + Vite + Tailwind）
- ✅ Menu Bar Tray 图标 + 窗口弹出/隐藏
- ✅ OpenClaw CLI 通信层（连接检测、Agent 列表、Session CRUD、Transcript 读取）
- ✅ 聊天 UI（消息气泡、Markdown、代码高亮、输入框）
- ✅ 设置面板（CLI 路径、主题、行为）
- ✅ 会话切换器
- ✅ 亮色/暗色主题
- ✅ Design Token 系统

待完善:
- 🔲 更精美的 tray icon（当前是占位符）
- 🔲 窗口位置记住/恢复
- 🔲 全局快捷键 (Cmd+Shift+C)
- 🔲 开机自启
- 🔲 远程 HTTP 模式（P2）
- 🔲 单元测试
- 🔲 E2E 测试
- 🔲 README.md

---

## 参考资源

- [Openclaw-Desktop](https://github.com/Luohao-Yan/Openclaw-Desktop) — Electron 全功能面板，CLI 通信参考
- [Handler](https://github.com/stephanemorera88-spec/Handler) — 多代理消息聚合器，WebSocket bridge 参考
- `docs/PRD.md` — 产品需求文档
- `docs/DESIGN.md` — UI/UX 设计规范
- `docs/ARCHITECTURE.md` — 架构文档
- `docs/design-tokens.json` — Design Token 定义
