---
title: "渲染"
layout: page
comments: false
toc: true
permalink: /rabbit-holes/rendering/
---
[← 返回兔子洞总览](/rabbit-holes/)

从一个朴素问题出发——**"游戏里的一帧画面到底是怎么产生的？"**——先建立与引擎无关的渲染原理，再把同一套概念映射到 Cocos Creator、Unity 等具体引擎。

## 学习原则

这一洞不从某个引擎 API 开始，而是先追清底层因果：

```text
为什么需要它
  ↓
它解决什么问题
  ↓
底层怎样工作
  ↓
会产生什么常见现象
  ↓
怎样观察和验证
  ↓
Cocos / Unity 如何包装它
```

引擎中的 `Sprite`、`Material`、`Camera`、`RenderTexture` 等概念，都会等通用原理建立以后再接进来。

## 推荐阅读顺序

| # | 篇 | 一句话 |
|---|---|---|
| 01 | [从场景到像素](/rabbit-holes/rendering/01-from-scene-to-pixel/) | 渲染就是把场景数据逐层变换成帧缓冲里的像素；分清像素、片元、颜色、分辨率和采样，是理解后续管线的地基 |
| 02 | [顶点、三角形与插值](/rabbit-holes/rendering/02-vertices-triangles-interpolation/) | 顶点提供离散属性，三角形确定覆盖范围，光栅化再用重心坐标为内部片元连续插值 |
| 03 | [坐标系与矩阵变换](/rabbit-holes/rendering/03-coordinate-spaces-and-matrices/) | 同一个顶点依次经过模型、观察、投影、透视除法和视口变换，才从局部坐标来到屏幕像素 |

## 后续追问路线

- [x] 01. 渲染是什么；像素、片元、分辨率与颜色
- [x] 02. 顶点、三角形、网格与插值
- [x] 03. 向量、坐标系与矩阵变换
- [ ] 04. CPU 如何组织数据并向 GPU 提交命令
- [ ] 05. 顶点着色器、图元装配、裁剪与光栅化
- [ ] 06. 片元着色器、纹理、UV 与采样
- [ ] 07. 深度测试、模板测试与透明混合
- [ ] 08. 法线、光照、材质与阴影
- [ ] 09. 前向渲染、延迟渲染、Render Pass 与后处理
- [ ] 10. Draw Call、批处理、Overdraw、带宽与 GPU 并行
- [ ] 11. 把整条链映射到 Cocos Creator
- [ ] 12. 把整条链映射到 Unity

这条顺序不是术语列表，而是一条因果链：先知道最终要得到什么，再追数据如何一步步变成它。

## 母题

本洞继续印证 [../patterns.md](/rabbit-holes/patterns/) 里的"分层 + 封装"：渲染不会用一个步骤直接把"角色"变成屏幕颜色，而是把场景、几何、片元和像素拆成不同表示层，每层只解决一种问题。
