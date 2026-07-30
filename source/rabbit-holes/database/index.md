---
title: "数据库"
layout: page
comments: false
toc: true
permalink: /rabbit-holes/database/
---
[← 返回兔子洞总览](/rabbit-holes/)

从一个朴素问题出发——**"数据库文件里到底怎么存，总不能是文本吧？"**——一路追到页、索引、缓存池、日志和事务恢复。

## 推荐阅读顺序

| # | 篇 | 一句话 |
|---|---|---|
| 01 | [数据库文件怎么存](/rabbit-holes/database/01-storage-pages-buffer-wal/) | 数据库文件不是文本，而是一套按页组织的二进制磁盘结构；内存缓存和日志共同保证快和可靠 |

## 母题

本洞继续印证 [../patterns.md](/rabbit-holes/patterns/) 里的"在更弱的底座上补出更强的抽象"：普通文件和磁盘只提供很朴素的读写能力，数据库在上面补出查询、索引、事务、恢复和并发控制。
