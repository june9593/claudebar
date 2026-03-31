# ClawBar — Test Plan

> **角色**: Tester
> **版本**: v1.0
> **日期**: 2026-03-31

---

## 1. 测试策略

| 类型 | 工具 | 覆盖范围 |
|------|------|---------|
| 单元测试 | Vitest | 纯函数、工具函数、store actions |
| 集成测试 | Vitest + mock | IPC 通道、CLI 交互模拟 |
| 手动测试 | 人工 checklist | 窗口行为、UI 交互、端到端消息流 |

---

## 2. 单元测试用例

### 2.1 OpenClaw 通信层 (`electron/ipc/`)

| 用例 ID | 描述 | 验证点 |
|---------|------|--------|
| UT-01 | `stripAnsi` 函数正确移除 ANSI 码 | 移除颜色码后输出纯文本 |
| UT-02 | `parseJsonlMessages` 解析正常 JSONL | 返回正确的 role + content + timestamp |
| UT-03 | `parseJsonlMessages` 处理 content 为数组的情况 | 拼接 text 类型的 content 块 |
| UT-04 | `parseJsonlMessages` 跳过非 message 类型的行 | 只返回 type=message 的行 |
| UT-05 | `parseJsonlMessages` 处理空文件/损坏行 | 返回空数组，不抛错 |
| UT-06 | `parseJsonlMessages` 去除时间戳前缀 | `[Mon 2026-03-23 00:51 GMT+8]` 被去除 |
| UT-07 | `scanStores` 正确扫描 agents 目录 | 返回 agentId + path 对 |
| UT-08 | 路径验证拒绝 `~/.openclaw/` 外的路径 | 返回错误 |
| UT-09 | `tryParseJson` 从混合输出中提取 JSON | 跳过非 JSON 前缀 |

### 2.2 设置管理 (`electron/ipc/settings.ts`)

| 用例 ID | 描述 | 验证点 |
|---------|------|--------|
| UT-10 | `getSettings` 返回默认值（无配置文件时） | 所有字段等于 defaults |
| UT-11 | `getSettings` 正确读取配置文件 | 合并 defaults + 用户配置 |
| UT-12 | 设置白名单拒绝非法 key | 非白名单 key 不写入 |

### 2.3 前端 Store (`src/stores/`)

| 用例 ID | 描述 | 验证点 |
|---------|------|--------|
| UT-13 | `sendMessage` 添加 optimistic 消息 | messages 立即包含 user 消息 |
| UT-14 | `sendMessage` 设置 isTyping + isSending | 状态正确变更 |
| UT-15 | `switchSession` 清空消息并重置状态 | messages=[], isTyping=false |
| UT-16 | `setView` 正确切换视图 | view 值变更 |
| UT-17 | Settings store 默认值正确 | 所有字段等于 defaults |

---

## 3. 集成测试用例

| 用例 ID | 描述 | Mock | 验证点 |
|---------|------|------|--------|
| IT-01 | 连接检测成功 | spawn 返回 version 字符串 | connected=true |
| IT-02 | 连接检测失败（CLI 不存在） | spawn 抛 ENOENT | connected=false |
| IT-03 | 获取 Agent 列表 | 读取 mock openclaw.json | 返回正确的 Agent[] |
| IT-04 | 创建 Session | spawn 返回 JSON 结果 | 返回 sessionId |
| IT-05 | 发送消息 | spawn detached | success=true |
| IT-06 | 读取 Transcript | mock JSONL 文件 | 返回有序去重消息 |
| IT-07 | IPC 输入验证 | 传 null/undefined/非法参数 | 返回 error，不 crash |

---

## 4. 手动测试清单

### 4.1 窗口行为

| # | 场景 | 预期 | 通过 |
|---|------|------|------|
| M-01 | 点击 menu bar 图标 | 聊天窗口在图标下方弹出 | ☐ |
| M-02 | 再次点击图标 | 窗口隐藏 | ☐ |
| M-03 | 按 ESC | 窗口隐藏（非 Pin 状态） | ☐ |
| M-04 | 拖拽标题栏 | 窗口跟随移动 | ☐ |
| M-05 | 拖拽窗口边缘 | 窗口 resize | ☐ |
| M-06 | Resize 到最小尺寸 | 不小于 320x400 | ☐ |
| M-07 | Resize 到最大尺寸 | 不超过 800x900 | ☐ |
| M-08 | 点击 Pin 按钮 | 切换 alwaysOnTop | ☐ |
| M-09 | Pin 状态下切换到其他应用 | 窗口保持可见 | ☐ |
| M-10 | 应用不在 Dock 栏显示 | Dock 无图标 | ☐ |

### 4.2 消息收发

| # | 场景 | 预期 | 通过 |
|---|------|------|------|
| M-11 | 输入文本 + Enter | 消息发送，右侧气泡显示 | ☐ |
| M-12 | Shift+Enter | 输入换行，不发送 | ☐ |
| M-13 | 空输入 Enter | 不发送 | ☐ |
| M-14 | 发送后 | 打字指示器出现 | ☐ |
| M-15 | AI 回复到达 | 左侧气泡显示 Markdown 内容 | ☐ |
| M-16 | 代码块 | 有语法标签 + Copy 按钮 | ☐ |
| M-17 | 长消息 | 自动滚动到底部 | ☐ |
| M-18 | 向上滚动后新消息 | 不强制滚动（用户正在看历史） | ☐ |

### 4.3 设置

| # | 场景 | 预期 | 通过 |
|---|------|------|------|
| M-19 | 打开设置面板 | 显示 CLI 路径、主题、行为选项 | ☐ |
| M-20 | 修改 CLI 路径 | 保存到 ~/.clawbar/settings.json | ☐ |
| M-21 | 切换主题（亮/暗/系统） | 即时生效 | ☐ |
| M-22 | 返回按钮 | 回到聊天界面 | ☐ |

### 4.4 会话管理

| # | 场景 | 预期 | 通过 |
|---|------|------|------|
| M-23 | 打开会话切换器 | 显示所有会话列表 | ☐ |
| M-24 | 切换到历史会话 | 加载历史消息 | ☐ |
| M-25 | 新建会话 | 创建成功并切换 | ☐ |

### 4.5 连接状态

| # | 场景 | 预期 | 通过 |
|---|------|------|------|
| M-26 | OpenClaw CLI 可用 | 标题栏绿色圆点 | ☐ |
| M-27 | OpenClaw CLI 不可用 | 标题栏红色圆点 + 输入框禁用 | ☐ |
| M-28 | 设置中点击"重试" | 重新检测连接 | ☐ |

### 4.6 主题

| # | 场景 | 预期 | 通过 |
|---|------|------|------|
| M-29 | 系统切换到暗色模式 | 跟随系统模式时自动切换 | ☐ |
| M-30 | 手动设置亮色 | 不跟随系统，固定亮色 | ☐ |

---

## 5. 边界和安全测试

| # | 场景 | 预期 |
|---|------|------|
| S-01 | 发送超长消息 (10KB+) | 正常发送，不 crash |
| S-02 | CLI 路径含特殊字符 | spawn 正确处理 |
| S-03 | sessions.json 损坏 | 返回空列表，不 crash |
| S-04 | JSONL 文件含恶意内容 | 正确转义，XSS 安全 |
| S-05 | 路径遍历攻击 (`../../etc/passwd`) | 拒绝，返回错误 |
| S-06 | 大量消息 (1000+) | 滚动流畅，内存合理 |
| S-07 | 应用多次快速点击 Tray | 不产生多个窗口 |

---

## 6. 性能基准

| 指标 | 目标 | 测量方式 |
|------|------|---------|
| 启动到 Tray 可见 | < 2s | `app.whenReady()` 到 Tray 创建的时间差 |
| 点击到窗口显示 | < 200ms | 计时 |
| 消息渲染 (100条) | < 500ms | Profiler |
| 空闲内存 | < 150MB | Activity Monitor |
