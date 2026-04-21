# ClawBar — Architecture Document

> **版本**: v1.0
> **日期**: 2026-03-31

---

## 1. 系统架构概览

ClawBar 采用 Electron 的经典双进程架构：

```
┌─────────────────────────────────────────────────────────┐
│                    macOS System                          │
│  ┌─────────┐                                            │
│  │ Menu Bar│ ← Tray Icon (NSStatusItem)                 │
│  └────┬────┘                                            │
│       │ click                                           │
│  ┌────▼──────────────────────────────────────────────┐  │
│  │              Main Process (Node.js)                │  │
│  │                                                    │  │
│  │  ┌──────────┐  ┌────────────┐  ┌───────────────┐  │  │
│  │  │ Tray     │  │ Window     │  │ IPC Hub       │  │  │
│  │  │ Manager  │  │ Manager    │  │               │  │  │
│  │  └──────────┘  └────────────┘  └───────┬───────┘  │  │
│  │                                        │          │  │
│  │  ┌─────────────────────────────────────▼───────┐  │  │
│  │  │         OpenClaw Communication Layer         │  │  │
│  │  │                                              │  │  │
│  │  │  ┌──────────┐  ┌──────────┐  ┌───────────┐  │  │  │
│  │  │  │ CLI      │  │ Session  │  │ Transcript│  │  │  │
│  │  │  │ Executor │  │ Manager  │  │ Reader    │  │  │  │
│  │  │  └──────────┘  └──────────┘  └───────────┘  │  │  │
│  │  └──────────────────────────────────────────────┘  │  │
│  └───────────────────────┬────────────────────────────┘  │
│                          │ IPC (contextBridge)           │
│  ┌───────────────────────▼────────────────────────────┐  │
│  │            Renderer Process (Chromium)              │  │
│  │                                                     │  │
│  │  ┌─────────┐  ┌────────────┐  ┌─────────────────┐  │  │
│  │  │ React   │  │ Zustand    │  │ Components      │  │  │
│  │  │ App     │  │ Stores     │  │ (Chat, Title,   │  │  │
│  │  │         │  │            │  │  Settings, etc) │  │  │
│  │  └─────────┘  └────────────┘  └─────────────────┘  │  │
│  └─────────────────────────────────────────────────────┘  │
│                          │                               │
│  ┌───────────────────────▼────────────────────────────┐  │
│  │              OpenClaw Instance                      │  │
│  │  (local CLI → ~/.openclaw/ or remote HTTP)          │  │
│  └─────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## 2. 目录结构

```
clawbar/
├── electron/                     # Electron 主进程 (TypeScript → CJS)
│   ├── main.ts                   # 应用入口：app lifecycle, tray, window
│   ├── preload.ts                # contextBridge：暴露 IPC API 给渲染进程
│   ├── tray.ts                   # Tray 图标管理、右键菜单
│   ├── window.ts                 # BrowserWindow 创建、位置/尺寸管理
│   └── ipc/
│       ├── index.ts              # IPC handler 注册入口
│       ├── openclaw.ts           # OpenClaw CLI 执行器（spawn 封装）
│       ├── sessions.ts           # Session CRUD IPC handlers
│       └── settings.ts           # 设置读写 IPC handlers
├── src/                          # React 渲染进程
│   ├── main.tsx                  # React 入口
│   ├── App.tsx                   # 根组件：路由、主题 Provider
│   ├── components/
│   │   ├── TitleBar.tsx          # 标题栏：拖拽、Pin、设置按钮
│   │   ├── ChatPanel.tsx         # 聊天面板（组合 MessageList + ChatInput）
│   │   ├── MessageList.tsx       # 消息列表：滚动容器、虚拟滚动
│   │   ├── MessageBubble.tsx     # 单条消息气泡：Markdown 渲染、代码高亮
│   │   ├── ChatInput.tsx         # 输入框：auto-resize、快捷键
│   │   ├── TypingIndicator.tsx   # 打字指示器动画
│   │   ├── SessionSwitcher.tsx   # 会话切换下拉面板
│   │   ├── SettingsPanel.tsx     # 设置面板
│   │   ├── EmptyState.tsx        # 空状态/欢迎界面
│   │   └── ErrorState.tsx        # 错误状态
│   ├── stores/
│   │   ├── chatStore.ts          # Zustand：消息列表、会话状态、发送逻辑
│   │   └── settingsStore.ts      # Zustand：配置状态、主题、持久化
│   ├── hooks/
│   │   ├── useAutoScroll.ts      # 自动滚动 hook
│   │   └── useTheme.ts           # 主题检测 hook
│   ├── types/
│   │   └── index.ts              # 共享类型定义
│   ├── styles/
│   │   └── globals.css           # 全局样式、CSS 变量、Design Token
│   └── utils/
│       └── markdown.ts           # Markdown 渲染配置
├── types/
│   └── electron.d.ts             # window.electronAPI 类型声明
├── resources/
│   ├── iconTemplate.png          # macOS menu bar 图标 (16x16)
│   ├── iconTemplate@2x.png       # macOS menu bar 图标 (32x32)
│   └── icon.png                  # 应用图标 (512x512)
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── electron-builder.yml
├── tailwind.config.js
├── postcss.config.js
├── index.html
└── docs/                         # 项目文档
    ├── PRD.md
    └── ARCHITECTURE.md
```

---

## 3. IPC 协议定义

### 3.1 Preload → Renderer（window.electronAPI）

所有 IPC 通信通过 `contextBridge` 暴露的 `window.electronAPI` 对象进行。

```typescript
interface ElectronAPI {
  // ── OpenClaw 通信 ──
  openclaw: {
    /** 检查 openclaw CLI 是否可用，返回版本信息 */
    checkConnection(): Promise<{ connected: boolean; version?: string; error?: string }>;

    /** 获取 Agent 列表 */
    getAgents(): Promise<{ success: boolean; agents?: Agent[]; error?: string }>;

    /** 获取 Session 列表 */
    getSessions(): Promise<{ success: boolean; sessions?: Session[]; error?: string }>;

    /** 创建新 Session */
    createSession(agentId: string): Promise<{ success: boolean; sessionId?: string; error?: string }>;

    /** 发送消息（异步，不等待回复） */
    sendMessage(sessionId: string, message: string): Promise<{ success: boolean; error?: string }>;

    /** 获取会话 Transcript */
    getTranscript(agentId: string, sessionKey: string): Promise<{
      success: boolean;
      messages?: Message[];
      error?: string;
    }>;

    /** 关闭 Session */
    closeSession(sessionId: string): Promise<{ success: boolean; error?: string }>;
  };

  // ── 设置 ──
  settings: {
    /** 获取所有设置 */
    get(): Promise<Settings>;

    /** 更新设置 */
    set(key: string, value: any): Promise<void>;

    /** 获取 OpenClaw CLI 路径 */
    getClawPath(): Promise<string>;

    /** 设置 OpenClaw CLI 路径 */
    setClawPath(path: string): Promise<void>;
  };

  // ── 窗口控制 ──
  window: {
    /** 置顶/取消置顶 */
    togglePin(): Promise<boolean>; // returns new pin state

    /** 隐藏窗口 */
    hide(): void;

    /** 获取 Pin 状态 */
    isPinned(): Promise<boolean>;
  };

  // ── 主题 ──
  theme: {
    /** 获取系统主题 */
    getSystemTheme(): Promise<'light' | 'dark'>;

    /** 监听系统主题变化 */
    onThemeChange(callback: (theme: 'light' | 'dark') => void): () => void;
  };
}
```

### 3.2 IPC Channel 命名规范

所有 channel 名采用 `domain:action` 格式：
- `openclaw:check-connection`
- `openclaw:get-agents`
- `openclaw:get-sessions`
- `openclaw:create-session`
- `openclaw:send-message`
- `openclaw:get-transcript`
- `openclaw:close-session`
- `settings:get`
- `settings:set`
- `window:toggle-pin`
- `window:hide`
- `window:is-pinned`
- `theme:get-system`
- `theme:changed` (event, main → renderer)

---

## 4. 数据流

### 4.1 发送消息流

```
User types message
        │
        ▼
ChatInput.tsx → Enter key
        │
        ▼
chatStore.sendMessage(text)
  │ 1. Add user message to state (optimistic)
  │ 2. Set isTyping = true
  │
  ▼
window.electronAPI.openclaw.sendMessage(sessionId, text)
  │
  ▼
Main Process: ipcMain.handle('openclaw:send-message')
  │
  ▼
spawn('openclaw', ['agent', '--session-id', uuid, '--message', text])
  │ (async, non-blocking — returns immediately)
  │
  ▼
Response: { success: true }
  │
  ▼
chatStore starts polling transcript every 1s
  │
  ▼
window.electronAPI.openclaw.getTranscript(agentId, sessionKey)
  │
  ▼
Main Process: reads JSONL files from ~/.openclaw/agents/<id>/sessions/
  │
  ▼
Returns new messages → chatStore updates messages[]
  │ When assistant message appears → set isTyping = false
  │ Stop polling after 2s of no new messages
```

### 4.2 状态管理结构

```typescript
// chatStore.ts
interface ChatState {
  // 当前会话
  currentSession: Session | null;
  currentAgent: Agent | null;

  // 消息
  messages: Message[];
  isTyping: boolean;
  isSending: boolean;

  // 会话列表
  sessions: Session[];
  agents: Agent[];

  // 连接状态
  connectionStatus: 'connected' | 'disconnected' | 'connecting';

  // 视图状态
  view: 'chat' | 'settings' | 'session-switcher';

  // Actions
  sendMessage: (text: string) => Promise<void>;
  loadTranscript: () => Promise<void>;
  switchSession: (session: Session) => void;
  createSession: (agentId: string) => Promise<void>;
  checkConnection: () => Promise<void>;
  setView: (view: ChatState['view']) => void;
}

// settingsStore.ts
interface SettingsState {
  clawPath: string;           // openclaw CLI path
  theme: 'light' | 'dark' | 'system';
  hideOnClickOutside: boolean;
  autoLaunch: boolean;
  fontSize: number;

  // Derived
  resolvedTheme: 'light' | 'dark';

  // Actions
  updateSetting: (key: string, value: any) => Promise<void>;
  loadSettings: () => Promise<void>;
}
```

---

## 5. OpenClaw CLI 通信层

### 5.1 CLI Executor（`electron/ipc/openclaw.ts`）

核心封装函数：

```typescript
/**
 * 执行 openclaw CLI 命令
 * - 自动注入 --no-color 和 --json flags
 * - 自动处理 PATH（确保版本管理器路径可用）
 * - 统一错误格式化
 * - 超时保护（默认 30s）
 */
async function execOpenClaw(
  args: string[],
  options?: { timeout?: number; cwd?: string }
): Promise<{ success: boolean; output: string; error?: string }>

/**
 * 解析 openclaw CLI 路径
 * 优先级: 用户配置 > which openclaw > 常见路径
 */
function resolveClawCommand(): string

/**
 * 获取完整 shell PATH（包含 nvm/fnm/homebrew 等路径）
 */
async function getShellPath(): Promise<string>
```

### 5.2 JSONL Transcript Reader

参考 Openclaw-Desktop 的实现：

```typescript
/**
 * 从 JSONL 文件解析聊天记录
 * 文件路径: ~/.openclaw/agents/<agentId>/sessions/<file>.jsonl
 *
 * JSONL 格式:
 * {"type":"message","message":{"role":"user","content":"hello"},"timestamp":"..."}
 * {"type":"message","message":{"role":"assistant","content":[{"type":"text","text":"..."}]},"timestamp":"..."}
 */
function parseJsonlTranscript(filePath: string): Message[]

/**
 * 查找某 session 关联的所有 JSONL 文件，合并去重
 */
async function readSessionTranscript(
  agentId: string,
  sessionKey: string
): Promise<Message[]>
```

### 5.3 Session 路径发现

```typescript
/**
 * 扫描文件系统获取 session store 路径
 * 路径规律: ~/.openclaw/agents/<agentId>/sessions/sessions.json
 */
function scanStores(): { agentId: string; path: string }[]
```

---

## 6. 窗口管理

### 6.1 BrowserWindow 配置

```typescript
const windowConfig: BrowserWindowConstructorOptions = {
  width: 380,
  height: 560,
  minWidth: 320,
  minHeight: 400,
  maxWidth: 800,
  maxHeight: 900,
  frame: false,           // frameless
  transparent: false,     // 不透明（性能考虑）
  resizable: true,
  movable: true,
  alwaysOnTop: false,     // 通过 toggle 控制
  skipTaskbar: true,      // Dock 不显示
  show: false,            // 初始隐藏
  vibrancy: 'popover',    // macOS 毛玻璃效果
  visualEffectState: 'active',
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  },
};
```

### 6.2 窗口位置策略

1. **首次打开**: 根据 Tray 图标位置，在图标正下方显示
2. **拖拽后再次打开**: 恢复到上次拖拽位置
3. **屏幕变化检测**: 如果保存的位置超出当前屏幕，重置到 Tray 图标下方

---

## 7. 构建配置

### 7.1 Vite

```
入口: index.html → src/main.tsx
输出: dist/ (渲染进程 bundle)
```

### 7.2 TypeScript 编译（主进程）

```
入口: electron/*.ts
输出: dist-electron/ (CJS)
tsconfig.node.json: target ES2022, module commonjs
```

### 7.3 Electron Builder

```yaml
appId: com.clawbar.app
productName: ClawBar
mac:
  category: public.app-category.productivity
  target: dmg
  icon: resources/icon.png
```

---

## 8. 安全考量

1. **contextIsolation: true** — 渲染进程无法访问 Node.js API
2. **sandbox: true** — 渲染进程沙箱化
3. **nodeIntegration: false** — 禁止渲染进程直接使用 Node
4. **IPC 输入验证** — 所有 IPC handler 验证入参类型和范围
5. **CLI 命令注入防护** — 使用 spawn（非 exec），参数作为数组传递，不拼接字符串
6. **路径遍历防护** — JSONL 文件读取限制在 `~/.openclaw/` 目录内
