---
title: "Git"
layout: page
comments: false
toc: true
permalink: /rabbit-holes/git/
---
[← 返回兔子洞总览](/rabbit-holes/)

从一个朴素问题出发——**"一个项目里为什么还要放另一个仓库？"**——一路追到 commit、分支、tag、可复现构建，以及跨项目共享 Cocos 框架时的边界。

## 推荐阅读顺序

| # | 篇 | 一句话 |
|---|---|---|
| 01 | [Git 子模块](/rabbit-holes/git/01-git-submodules/) | 子模块把另一个仓库挂进父项目目录，但父项目最终固定的是它的精确 commit；分支跟踪只是主动选择下一次要固定哪个版本的策略 |

## 后续追问路线

- [x] 01. 子模块、gitlink、固定 commit、tag 与分支更新
- [ ] 02. commit、tree、blob 与引用：Git 为什么能精确复现一个版本
- [ ] 03. 分支、合并、rebase 与冲突：多条历史怎样重新汇合
- [ ] 04. `worktree`：同一仓库怎样同时维护多个任务
- [ ] 05. 子模块、subtree、包管理器：共享代码该选哪一种

## 母题

本洞继续印证 [../patterns.md](/rabbit-holes/patterns/) 里的"分层 + 封装"：父项目只管理依赖的入口和版本，子模块自己管理代码、分支和历史。把两层混在一起看，才会把“跟踪分支”误解成“不固定版本”。
