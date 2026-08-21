---
title: "跨洞母题"
layout: page
comments: false
toc: true
permalink: /rabbit-holes/patterns/
---
[← 返回兔子洞总览](/rabbit-holes/)

跨主题反复出现的思维模式。每发现一个新洞印证了某个母题，就回来加一条——这一页越长，说明你越接近"事物背后共通的道理"。

## 已建立的连接，双向都能走

一旦连接由内向外建好，两个方向就都能走，不必再发起"陌生入站"。

- [内网穿透](/rabbit-holes/networking/01-intranet-penetration/)：本地主动建隧道并保持，外部请求借它**反向流回**内网。
- [WebSocket](/rabbit-holes/networking/07-websocket/)：客户端建好连接，服务器借**同一条连接的回程**主动推消息。

## 信任 / 解析追到底，必有内置锚点

任何"层层往上问"的体系，最底下必须有个"出厂就钉死、不再往下问"的锚点，否则无限递归、永远落不了地。

- [DNS](/rabbit-holes/networking/02-dns/)：根服务器 IP 内置在软件里；本地 DNS 的地址靠 DHCP 自动给。
- [TLS](/rabbit-holes/networking/06-tls/)：根证书出厂内置在操作系统 / 浏览器里。

## 分层 + 封装

每层只管自己那一级抽象，上下互不干涉；数据层层加头（封装）、层层拆头（解封装）。

- [分层与封装](/rabbit-holes/networking/03-layering/)：IP / TCP / HTTP 各管一层。
- [WebSocket / socket](/rabbit-holes/networking/07-websocket/)：socket 是接口、不是协议。
- [负载均衡](/rabbit-holes/networking/08-load-balancing-cdn/)：L4 看 IP+端口，L7 看 HTTP 内容。
- [事件循环 vs 游戏帧循环](/rabbit-holes/javascript/02-event-loop-vs-game-loop/)：JS 微任务、宿主 timer、Cocos scheduler 各自属于不同调度层。
- [JavaScript 内存与生命周期](/rabbit-holes/javascript/03-memory-lifecycle/)：业务生命周期、JS 引用可达性、宿主和 native 资源属于不同层，结束其中一层不代表其他层已经结束。
- [ECMAScript、模块与兼容](/rabbit-holes/javascript/06-modules-and-compatibility/)：语言版本、模块系统、构建转换和运行时 polyfill 是四层不同问题，名字同时出现不代表属于同一条版本线。
- [从场景到像素](/rabbit-holes/rendering/01-from-scene-to-pixel/)：场景、几何、片元和像素属于不同表示层；渲染管线让每一层只完成一种变换，再把结果交给下一层。
- [Git 子模块](/rabbit-holes/git/01-git-submodules/)：父项目管理依赖版本，子模块管理自身代码与历史；`.gitmodules` 只描述入口，父项目的 gitlink 才负责固定可复现的 commit。

## 在更弱的底座上补出更强的抽象

底层常常只给一个很朴素、甚至有缺陷的能力；上层靠编号、约定、状态表、签名、缓存等机制，补出应用真正想要的高级能力。

- [TCP](/rabbit-holes/networking/05-tcp/)：IP 只尽力而为，TCP 用序号、确认、重传补出可靠有序字节流。
- [HTTP / Cookie / Session](/rabbit-holes/networking/09-http-cache-cookie-session/)：HTTP 天生无状态，Cookie + Session 在独立请求之间补出登录态；缓存给重复请求补"记忆"。
- [数据库](/rabbit-holes/database/01-storage-pages-buffer-wal/)：普通文件和磁盘只提供朴素读写，数据库用页、索引、缓存池和日志补出可靠、可查询、可恢复的账本。
- [JavaScript 运行时](/rabbit-holes/javascript/01-js-runtime/)：ECMAScript 只定义语言核心，浏览器和 Node.js 作为宿主补出网络、文件、DOM、定时器和事件循环。
- [工程化](/rabbit-holes/engineering/01-what-is-engineering/)：人的记忆、手工操作和个人经验都不可靠，工程化用约定、工具、自动化和反馈补出稳定交付。

## 追到最底，是物理 / 人 / 商业

技术链条总有落地的地基——不是某个中央调度，而是物理规则、人工配置、商业合同。

- [路由与 BGP](/rabbit-holes/networking/04-routing-bgp/)：路由表的尽头是 IANA 发号 + 各家人工配 BGP 邻居 + 商业互联协议。
