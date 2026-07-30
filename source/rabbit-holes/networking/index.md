---
title: "计算机网络"
layout: page
comments: false
toc: true
permalink: /rabbit-holes/networking/
---
[← 返回兔子洞总览](/rabbit-holes/)

从一个具体问题出发——**"NAT 后面的机器，外面怎么访问？"**——一路追根究底，直到能把"打开一个网页"拆到零件级。

## 推荐阅读顺序

| # | 篇 | 一句话 |
|---|---|---|
| 01 | [内网穿透 / NAT](/rabbit-holes/networking/01-intranet-penetration/) | NAT 放出站、挡陌生入站；穿透靠一条主动建好的隧道反向流回 |
| 02 | [DNS](/rabbit-holes/networking/02-dns/) | 域名→IP，从根开始层层迭代追问 |
| 03 | [分层与封装](/rabbit-holes/networking/03-layering/) | TCP/IP 四层模型；数据像套娃一样层层加头 |
| 04 | [逐跳路由 / BGP](/rabbit-holes/networking/04-routing-bgp/) | IP 不变、MAC 每跳变；全球路由靠 BGP 涟漪式通告 |
| 05 | [TCP](/rabbit-holes/networking/05-tcp/) | 三次握手 / 四次挥手 / 滑动窗口 / 拥塞控制 |
| 06 | [TLS / HTTPS](/rabbit-holes/networking/06-tls/) | 防偷听（DH 换钥匙）+ 防冒充（证书信任链） |
| 07 | [WebSocket / socket / HTTP·TCP·UDP](/rabbit-holes/networking/07-websocket/) | 借 HTTP 升级成双向常开；理清协议与接口 |
| 08 | [负载均衡 / CDN](/rabbit-holes/networking/08-load-balancing-cdn/) | 一台扛不住怎么分流；内容怎么就近用户 |
| 09 | [HTTP / 缓存 / Cookie / Session](/rabbit-holes/networking/09-http-cache-cookie-session/) | HTTP 一问一答且无状态；缓存让它少问，Cookie/Session 让它认得你 |
| 10 | [CPA / CLIProxyAPI](/rabbit-holes/networking/10-cli-proxy-api/) | 用一个本地 API 网关统一模型协议、OAuth 凭据与多账号路由 |

## 一图总览

一次访问大网站，把这些篇章串起来：

![一次访问的完整旅程](/rabbit-holes/networking/assets/full-request-journey.svg)

## 母题

本洞印证的跨领域母题见 [../patterns.md](/rabbit-holes/patterns/)：已建立连接双向可走、信任的内置锚点、分层封装、在弱底座上补强抽象、追到底是物理/人/商业。
