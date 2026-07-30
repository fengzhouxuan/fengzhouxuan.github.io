---
title: "DNS：域名怎么变成 IP"
layout: page
comments: false
toc: true
permalink: /rabbit-holes/networking/02-dns/
---
[← 返回兔子洞总览](/rabbit-holes/) · [networking 主题地图](/rabbit-holes/networking/)

> 先查各级缓存；查不到就由本地 DNS 从**根 → 顶级域 → 权威服务器**层层迭代追问，每级只负责指路，最终在权威服务器拿到 IP 并缓存。

## 我追问的链

- 我输入 `example.com`，它怎么变成一个 IP？
- 如果谁都没缓存，第一步去问谁？→ 根服务器的 IP 又是哪来的？
- 我电脑怎么知道"本地 DNS"在哪？→ 这个地址哪来的？
- 改了域名解析，为什么不立刻生效？

## 核心理解

**DNS（Domain Name System，域名系统）= 全球电话簿**：把域名翻译成 IP。

**先查缓存**，一级级往下：浏览器 → 操作系统 → hosts 文件 → 本地 DNS。任何一层命中就直接返回。

都没有，就由**本地 DNS 替你迭代追问**（它跑腿，每一级只告诉它"下一步去问谁"）：

1. 问**根服务器**："`.com` 找谁？" → 根答："去问 `.com` 顶级域服务器。"
2. 问 **`.com` 顶级域（TLD）服务器**："`example.com` 找谁？" → 答："去问它的权威服务器。"
3. 问**权威服务器**："`example.com` 的 IP？" → 终于拿到 IP。

然后本地 DNS 缓存结果、返回给你。

**两个"天生就知道"的锚点**（否则第一步无从问起）：

- **根服务器的 IP**：**内置在软件里**（出厂就带着一份根提示文件）。
- **本地 DNS 的地址**：你接入网络时，**DHCP（Dynamic Host Configuration Protocol，动态主机配置协议）自动分配**给你。

**TTL（Time To Live，生存时间）**：每条解析结果能缓存多久。所以改 DNS 要等旧缓存过期才全网生效。

## 逻辑闭环 / 锚点

整条"层层追问"的链，落地在两个**出厂就钉死、不再往下问**的锚点上（根 IP 内置 + 本地 DNS 靠 DHCP 给）。没有锚点，追问会无限递归、永远问不到头。

## 关联

- [06-tls](/rabbit-holes/networking/06-tls/) 的**根证书内置**和这里是**同一个套路**——见母题 [信任 / 解析追到底，必有内置锚点](/rabbit-holes/patterns/)。
- 拿到 IP 之后，包怎么送过去？见 [03-layering](/rabbit-holes/networking/03-layering/) 和 [04-routing-bgp](/rabbit-holes/networking/04-routing-bgp/)。

---

*来源：与 Claude 的对话，2026-06。*
