# ClawBar — Product Requirements Document

> **角色**: Product Manager
> **版本**: v2.0
> **日期**: 2026-04-14

---

## 1. 产品概述

**ClawBar** 是一个 macOS menu bar 聊天客户端，通过嵌入 OpenClaw（龙虾）内置的 Control UI 聊天页面，让用户无需安装飞书、Discord、Teams 等重型应用，直接通过 menu bar 图标一键唤起轻量聊天窗口，与自部署的 OpenClaw 实例进行对话。

### 1.1 目标用户

- 在 Azure VM 或其他服务器上自部署了 OpenClaw 的开发者
- 希望通过 OpenClaw 的 default channel 进行日常聊天
- 不想为聊天安装重型 IM 客户端
- 使用 macOS 的用户

### 1.2 核心价值主张

| 痛点 | ClawBar 的解决方案 |
|------|-------------------|
| OpenClaw 聊天需要打开浏览器 | macOS menu bar 一键唤起，iframe 嵌入 Control UI |
| 聊天入口深藏在网页中 | macOS menu bar 一键唤起，随叫随到 |
| 不想装飞书/Discord/Teams | 极简单一入口，嵌入 OpenClaw 原生聊天 UI |
| 窗口不够灵活 | 支持 resize、拖拽、pin（置顶） |

---

## 2. 用户故事

### US-01: 快速唤起聊天
> 作为一个开发者，我想点击 macOS menu bar 上的 ClawBar 图标，立即弹出聊天窗口，这样我可以在任何工作场景下快速与 OpenClaw 对话。

**验收标准**:
- [ ] Menu bar 显示 ClawBar 图标（16x16 template icon）
- [ ] 点击图标，聊天窗口在图标下方弹出，动画时长 < 200ms
- [ ] 再次点击图标或按 ESC，窗口隐藏
- [ ] 应用不在 Dock 中显示

### US-02: 发送和接收消息
> 作为一个用户，我想在聊天窗口中与 OpenClaw 对话，聊天体验由 OpenClaw 内置的 Control UI 提供，支持 Markdown、代码高亮、会话管理等完整功能。

**验收标准**:
- [ ] 聊天窗口通过 iframe 嵌入 OpenClaw Control UI（`http://<gateway>:18789/`）
- [ ] iframe 正确加载，无 X-Frame-Options / CSP 阻拦
- [ ] 用户可在嵌入页面中正常发送和接收消息
- [ ] 加载中显示 loading 状态，加载失败显示错误提示
- [ ] 所有聊天功能（Markdown 渲染、代码高亮、消息搜索、一键复制等）由 OpenClaw UI 原生提供

### US-03: 窗口灵活操作
> 作为一个用户，我想自由调整聊天窗口的大小和位置，并能将窗口置顶，这样我可以边工作边聊天。

**验收标准**:
- [ ] 窗口可通过拖拽标题栏移动位置
- [ ] 窗口可通过边缘拖拽调整大小（最小 320x400，最大 800x900）
- [ ] 标题栏有 Pin 按钮，点击后窗口置顶（always on top），图标状态变化
- [ ] Pin 状态下点击外部不会隐藏窗口
- [ ] 非 Pin 状态下点击外部可选隐藏窗口（可在设置中配置）

### US-04: 配置 OpenClaw 连接
> 作为一个用户，我想配置 OpenClaw Gateway 的地址和认证信息，这样我可以连接到我的自部署实例。

**验收标准**:
- [ ] 设置面板支持配置 Gateway URL（默认 `http://localhost:18789`）
- [ ] 支持配置 Token 和/或 Password 用于认证
- [ ] 认证信息通过 URL fragment（`#token=...&password=...`）传递给 iframe，不暴露在 query params 中
- [ ] 配置保存后持久化到 `~/.clawbar/settings.json`，下次启动自动加载
- [ ] 配置变更后 iframe 自动重新加载

### US-04b: 首次启动引导
> 作为一个新用户，首次启动 ClawBar 时，我想看到欢迎界面和"打开设置"按钮，这样我知道需要先配置 Gateway 连接。

**验收标准**:
- [ ] 未配置 Gateway URL 时显示欢迎状态
- [ ] 显示"打开设置"CTA 按钮引导用户配置
- [ ] 配置完成后自动加载 OpenClaw UI

### US-05: 会话管理
> 作为一个用户，我想在嵌入的 OpenClaw UI 中创建新会话、切换历史会话，这些功能由 OpenClaw Control UI 原生提供。

**验收标准**:
- [ ] OpenClaw Control UI 内置的会话管理功能可正常使用
- [ ] 会话切换、创建新会话等操作在 iframe 中正常响应
- [ ] ClawBar 不额外实现会话管理逻辑

### US-06: 主题切换
> 作为一个用户，我想在亮色和暗色主题之间切换，以匹配我的系统外观。

**验收标准**:
- [ ] 支持亮色、暗色、跟随系统三种模式
- [ ] 主题切换即时生效，无需重启
- [ ] 默认跟随系统

---

## 3. 功能需求清单

### P0 — 必须有（MVP）

| ID | 功能 | 描述 |
|----|------|------|
| F-01 | Menu Bar Tray | macOS menu bar 图标，点击弹出/隐藏聊天窗口 |
| F-02 | 聊天窗口 | Frameless 可 resize/拖拽的浮动窗口 |
| F-03 | 嵌入 OpenClaw Control UI | 通过 iframe 嵌入 OpenClaw 内置聊天页面，Electron 剥离 X-Frame-Options/CSP 响应头 |
| F-04 | Gateway 连接配置 | 配置 Gateway URL + Token/Password，认证信息通过 URL fragment 传递 |
| F-05 | 主题切换 | 亮色/暗色/跟随系统 |
| F-06 | Dock 隐藏 | 应用仅在 menu bar 显示，不出现在 Dock |
| F-07 | Pin 窗口 | Always on top 切换 |

### P1 — 应该有

| ID | 功能 | 描述 |
|----|------|------|
| F-08 | 会话切换 | OpenClaw Control UI 内置的会话管理 |
| F-09 | ESC 隐藏窗口 | 非 Pin 状态下按 ESC 隐藏窗口 |
| F-10 | 窗口位置记忆 | 记住拖拽位置，下次显示时恢复 |
| F-11 | 右键托盘菜单 | Show/Hide + Quit 上下文菜单 |

### P2 — 锦上添花

| ID | 功能 | 描述 |
|----|------|------|
| F-12 | 全局快捷键 | Cmd+Shift+C 唤起窗口 |
| F-13 | 开机自启 | 登录时自动启动 |
| F-14 | 通知 | 收到新消息时系统通知 |
| F-15 | DMG 打包分发 | electron-builder arm64 + x64 |

---

## 4. 非功能需求

### 4.1 性能
- 应用启动到 menu bar 图标出现 < 2 秒
- 点击图标到窗口显示 < 200ms
- 消息发送到回复开始显示 < OpenClaw 处理时间 + 500ms
- 内存占用 < 150MB（空闲时）

### 4.2 安全
- Token/Password 通过 URL fragment 传递给 iframe（不暴露在 query params 或网络请求中）
- Electron 主进程拦截并剥离 OpenClaw 响应中的 `X-Frame-Options` 和 `frame-ancestors` CSP 头，允许 iframe 嵌入
- 配置文件使用 JSON 文件存储（`~/.clawbar/settings.json`）
- `contextIsolation: true`，`sandbox: true`，`nodeIntegration: false`
- 不收集任何用户数据

### 4.3 兼容性
- macOS 12+ (Monterey 及以上)
- Apple Silicon (arm64) + Intel (x64)
- OpenClaw 3.24+（首版）

### 4.4 可配置性
- Gateway URL、Token、Password 均可在设置面板中配置
- 开源友好：其他用户 clone 后配置自己的 Gateway 地址即可使用

---

## 5. 技术约束

- 使用 Electron 38 构建
- 前端使用 React 19 + TypeScript + Tailwind CSS 4
- 通过 iframe 嵌入 OpenClaw Control UI（`http://<gateway>:18789/`）与 OpenClaw 交互
- Electron 主进程使用 `session.webRequest.onHeadersReceived` 剥离 `X-Frame-Options` 和 `frame-ancestors` CSP 头
- 认证信息通过 URL fragment 传递（`#token=...&password=...`），不经过网络
- 使用 Zustand 管理前端状态
- 打包为 macOS DMG（electron-builder）

---

## 6. 成功指标

| 指标 | 目标 |
|------|------|
| 首次配置完成时间 | < 2 分钟 |
| 日均使用频率 | > 10 次唤起 |
| 消息发送成功率 | > 99% |
| 崩溃率 | < 0.1% |

---

## 7. 里程碑

| 阶段 | 交付物 | 状态 |
|------|--------|------|
| M1: 基础框架 | Menu bar + 窗口 + iframe 嵌入 + 设置面板 + 主题 | ✅ 完成 |
| M2: 功能完善 | 窗口位置记忆 + ESC 隐藏 + 开机自启 | 开发中 |
| M3: 打磨发布 | E2E 测试 + 文档 + DMG 打包 | 未开始 |

---

## 8. 开放问题

1. ~~通信方式选择~~ → 已决定使用 iframe 嵌入 OpenClaw Control UI（放弃 CLI 模式）
2. ~~技术栈选择~~ → 已决定使用 Electron + React + Tailwind
3. ~~远程连接方式~~ → Gateway URL 配置即支持本地和远程
4. 是否支持多实例（同时连接多个 OpenClaw）→ 暂不支持，P2 考虑

---

## 9. 决策记录

| 决策 | 结论 | 理由 |
|------|------|------|
| 通信方式 | iframe 嵌入 Control UI | 复用 OpenClaw 原生 UI，无需重新实现聊天、Markdown 渲染、消息搜索等功能 |
| 认证传递 | URL fragment | fragment 不随 HTTP 请求发送，比 query params 更安全 |
| CSP 处理 | Electron 剥离响应头 | OpenClaw 默认禁止 iframe 嵌入，需在 Electron 层面移除限制 |
| 状态管理 | Zustand | 轻量，无 Context 嵌套，适合简单应用 |
