---
title: "CPA / CLIProxyAPI：把多个模型账号变成统一 API，代理到底做了什么"
layout: page
comments: false
toc: true
permalink: /rabbit-holes/networking/10-cli-proxy-api/
---
[← 返回兔子洞总览](/rabbit-holes/) · [networking 主题地图](/rabbit-holes/networking/)

> CLIProxyAPI（常简称 CPA）是一个本地 **AI API 网关 / 协议适配器**：客户端只连一个兼容 API，CPA 在中间完成客户端鉴权、账号选择、协议转换和上游 OAuth 调用，再把结果流式返回。

## 我追问的链

- CPA 说自己是“代理”，它和 HTTP 代理、VPN 有什么区别？
- 明明登录的是 ChatGPT / Claude / Gemini 账号，为什么能暴露成 API？
- 客户端填的 `api-key` 和 OAuth 登录得到的 token 是同一个东西吗？
- Claude Code 经 CPA 调 GPT，跑的到底是 Claude Code 还是 Codex？
- 多账号轮询、失败重试和协议兼容，分别发生在哪一层？

## 1. 先看它解决什么问题

假设本机有三个 AI 客户端，它们各自认识不同的协议：

- 一个会调用 OpenAI Responses API；
- 一个会调用 OpenAI Chat Completions；
- 一个会调用 Anthropic Messages API。

而上游又有 Codex、Claude、Gemini 等不同账号和接口。如果每个客户端都直接适配每个上游，会变成 `客户端数 × 上游数` 套接线。

CPA 在中间收口：

```text
Codex / Claude Code / OpenCode / SDK
                 │
                 │ OpenAI / Claude / Gemini 兼容请求
                 ▼
        http://127.0.0.1:8317
      ┌─────────────────────────┐
      │       CLIProxyAPI       │
      │ ① 校验本地 API Key      │
      │ ② 识别模型和请求协议     │
      │ ③ 选择可用账号           │
      │ ④ 转换请求 / 流式事件    │
      └─────────────────────────┘
          │         │         │
          ▼         ▼         ▼
       OpenAI   Anthropic   Google
        OAuth      OAuth      OAuth
```

客户端从此只依赖 CPA 的稳定入口；换账号、换上游、做轮询，主要改 CPA 一处。

## 2. 它不是哪种“代理”

“代理”这个词至少有三种常见含义：

| 类型 | 主要解决的问题 | 是否理解 AI 请求 |
|---|---|---|
| HTTP / SOCKS 正向代理 | 帮客户端访问另一个网络地址 | 通常不理解模型、工具调用等业务语义 |
| VPN | 把设备或网段的流量送入另一条网络 | 不理解具体 AI API |
| CPA 这类 API 网关 | 统一鉴权、路由账号、适配 API 协议 | 理解模型名、消息、工具、流式事件 |

所以 CPA 更像 [L7 负载均衡器](/rabbit-holes/networking/08-load-balancing-cdn/)：它必须拆开应用层请求，看懂路径、模型和消息格式后再决定发给谁。它自己还可以配置 `proxy-url`，借真正的 HTTP / SOCKS 代理访问上游——这反过来证明两种“代理”不是同一层东西。

更精确地说，它同时扮演：

- **反向代理 / API 网关**：对客户端隐藏多个上游，只暴露一个入口；
- **协议适配器**：在 OpenAI、Claude、Gemini 等请求格式之间翻译；
- **凭据代理**：保存和刷新上游 OAuth 凭据，客户端不直接接触它们；
- **调度器**：多个账号可轮询、粘滞选择、冷却和故障转移。

## 3. 一次请求实际怎么走

以 Codex 客户端调用本机 CPA 为例：

1. Codex 把 `base_url` 指向 `http://127.0.0.1:8317/v1`。
2. 请求带一个 CPA 配置里的本地 `api-key`。
3. CPA 校验这个 key，解析请求使用的模型和 wire API。
4. 路由器从符合条件的上游凭据中选一个；默认可按轮询，也可配置其他策略。
5. 如果客户端协议和上游协议不同，CPA 转换请求结构。
6. CPA 使用该账号的 OAuth token 或上游 API key 请求真正的模型服务。
7. 上游返回流式事件；CPA必要时再次转换事件格式，再沿原 HTTP / WebSocket 连接发回客户端。
8. 遇到特定瞬时错误或额度耗尽时，CPA可以让凭据进入冷却，并尝试其他可用凭据。

这里没有“凭空制造模型能力”。真正的推理仍发生在上游；CPA只是控制请求如何到达上游。

## 4. 两层鉴权：最容易混的地方

一条请求跨过两道门：

```text
客户端 ── 本地 api-key ──▶ CPA ── OAuth token / 上游 key ──▶ 模型服务
```

- **CPA 的 `api-keys`**：保护“谁可以调用我的代理”。它由你自己配置，即使示例写成 `sk-...`，也不是 OpenAI 发的 key。
- **上游 OAuth 凭据**：证明“CPA 可以代表哪个账号访问上游”。登录后通常保存在 `auth-dir`，需要妥善保护。

因此，客户端拿到本地 key，并不等于拿到了你的 ChatGPT 或 Claude 登录凭据；但它可能可以通过 CPA 消耗这些账号的额度，所以本地 key 仍然不能泄露。

## 5. “换模型”不等于“换 Agent”

一个 AI 编程工具至少分两层：

- **Agent 外壳**：负责读文件、调用 shell、组织上下文、执行工具、循环判断下一步；
- **模型后端**：接收整理后的消息，返回文本或工具调用意图。

例如 Claude Code 经 CPA 调用 GPT：

- Agent 循环、工具定义、上下文整理仍来自 Claude Code；
- 负责推理并生成下一步的是 GPT；
- CPA 负责在两者之间翻译和转发。

所以最终体验是“Claude Code 的 Agent 外壳 + GPT 模型”，不等同于原生 Codex。即便模型相同，不同 Agent 的系统提示词、工具协议、上下文压缩和执行策略也会让结果不同。

## 6. 协议兼容为什么不是改个字段名

不同厂商协议表达的能力并不完全对齐：

- 流式响应的事件名称和顺序不同；
- tool call 的参数、ID 和回传结构不同；
- reasoning、prompt cache、多模态等能力可能只有某一侧支持；
- 同一个 `system` 消息在不同 Agent 和上游中可能有不同约束；
- 错误码、额度耗尽和重试语义不同。

因此“兼容 API”通常表示常用路径能互通，不保证所有边缘能力都无损。出了问题要分层定位：

1. 客户端有没有按预期生成请求？
2. CPA 选择了哪个 provider / 账号？
3. 协议转换有没有丢字段或改变事件？
4. 上游实际返回了什么错误？

这和网络分层排错是同一个母题：先确认故障属于哪一层，再改那一层。

## 7. 最小本地实验

在 macOS 上可以先只做本机闭环：

```bash
brew install cliproxyapi
brew services start cliproxyapi
```

配置至少收紧这几项：

```yaml
host: "127.0.0.1"
port: 8317
auth-dir: "~/.cli-proxy-api"
api-keys:
  - "换成自己生成的长随机值"
remote-management:
  allow-remote: false
  secret-key: ""
```

然后选择相应的 OAuth 登录流程，把客户端的 `base_url` 指向本机地址。先观察一条请求：客户端请求格式 → CPA 日志中的路由结果 → 上游响应 → 客户端收到的流式事件。

不要一开始就把端口暴露到公网。官方示例中 `host: ""` 会监听所有 IPv4 / IPv6 接口；本机学习时绑定 `127.0.0.1` 更容易守住边界。若确实要远程共享，还需要 TLS、强随机 key、防火墙、访问控制、日志脱敏和凭据隔离。

## 8. 使用边界

- **安全**：CPA 能看到请求正文，保存上游凭据，也能消耗账号额度；部署者实际上掌握了一个高权限网关。
- **隐私**：代码、提示词和工具结果会经过 CPA 并到达所选上游，不要把不可信的公共中转当成本地代理。
- **稳定性**：客户端、CPA 和上游任一方改协议，都可能造成兼容问题。
- **合规**：用订阅账号的 OAuth 凭据提供兼容 API，不等同于购买官方 API 服务；是否允许共享、池化或自动调用，应以对应提供商当前的服务条款和组织政策为准。

## 逻辑闭环 / 锚点

CPA 的本质不是“把 A 模型伪装成 B 模型”，而是把变化集中到一个中间层：

> 下游只认稳定的兼容协议；上游各说各话；CPA 负责鉴权、路由和翻译。

它复用了 [负载均衡](/rabbit-holes/networking/08-load-balancing-cdn/) 的 L7 路由、[HTTP](/rabbit-holes/networking/09-http-cache-cookie-session/) 的请求/响应与 Bearer 凭据、[WebSocket](/rabbit-holes/networking/07-websocket/) 的流式双向通道。代价也正来自这个中间层：多一个可观察、可控制的收口点，也多一个故障点和高权限安全边界。

## 关联与资料

- [CLIProxyAPI 官方仓库](https://github.com/router-for-me/CLIProxyAPI)
- [官方快速开始](https://help.router-for.me/introduction/quick-start)
- [官方基础配置](https://help.router-for.me/cn/configuration/basic)
- [官方 Codex 客户端配置](https://help.router-for.me/agent-client/codex)
- [07-WebSocket](/rabbit-holes/networking/07-websocket/)：部分流式响应可走 WebSocket。
- [08-负载均衡 / CDN](/rabbit-holes/networking/08-load-balancing-cdn/)：CPA 的账号路由属于 L7 调度。
- [09-HTTP / Cookie / Session](/rabbit-holes/networking/09-http-cache-cookie-session/)：API 请求、Bearer key 和 OAuth 都落在 HTTP 应用层。

---

*来源：CLIProxyAPI 官方仓库与文档、与 Codex 的对话，2026-07。*
