---
title: "JavaScript"
layout: page
comments: false
toc: true
permalink: /rabbit-holes/javascript/
---
[← 返回兔子洞总览](/rabbit-holes/)

从一个朴素问题出发——**"JavaScript 不是只有一门语言吗，为什么还分浏览器、Node.js、运行时？"**——一路追到 JS 引擎、宿主环境、事件循环和异步 API 的边界。

## 推荐阅读顺序

| # | 篇 | 一句话 |
|---|---|---|
| 01 | [JavaScript 运行时](/rabbit-holes/javascript/01-js-runtime/) | JS 引擎只负责执行语言本身；宿主运行时补出事件循环、异步 API、GC、内存边界和 native bridge 等能力 |
| 02 | [事件循环 vs 游戏帧循环](/rabbit-holes/javascript/02-event-loop-vs-game-loop/) | `Promise.then` 是 JS 微任务，不是下一帧；Cocos 的 `scheduleOnce` / `update` 属于引擎帧调度 |
| 03 | [内存与生命周期](/rabbit-holes/javascript/03-memory-lifecycle/) | GC 只按可达性回收对象；业务还要主动结束事件、定时器、异步任务和 native 资源的生命周期 |
| 04 | [语言语义](/rabbit-holes/javascript/04-language-semantics/) | 普通函数的 `this` 看调用方式；闭包保存词法环境；相等与空值由各自的规范算法决定 |
| 05 | [Promise 与错误流](/rabbit-holes/javascript/05-promise-error-flow/) | Promise 传播未来的成功值和失败原因；`await` 把 rejection 接回当前 async 函数的异常流 |
| 06 | [ECMAScript、模块与兼容](/rabbit-holes/javascript/06-modules-and-compatibility/) | ES5/ES2015 是语言版本，CommonJS/ESM 是模块系统，转译和 polyfill 又分别属于另外两层 |

## 对话覆盖地图

| 主线 | 关键问题 | 笔记 |
|---|---|---|
| 语言、引擎、宿主 | JavaScript、ECMAScript、V8/JSC、浏览器/Node/Cocos 分别是谁 | [01](/rabbit-holes/javascript/01-js-runtime/) |
| 异步调度 | Promise、宏任务/微任务、`then` 是否隔帧、游戏帧循环 | [01](/rabbit-holes/javascript/01-js-runtime/)、[02](/rabbit-holes/javascript/02-event-loop-vs-game-loop/) |
| 内存与生命周期 | GC、闭包引用、事件解绑、异步过期、JS/native 资源 | [03](/rabbit-holes/javascript/03-memory-lifecycle/) |
| 函数与对象语义 | `this`、`bind`、箭头函数、闭包 vs 类 | [04](/rabbit-holes/javascript/04-language-semantics/) |
| 比较与空值 | `===`、`==`、`ToPrimitive`、`null`、`undefined` | [04](/rabbit-holes/javascript/04-language-semantics/) |
| 异步结果与错误 | Promise 状态和链、`throw`、`try/catch/finally` | [05](/rabbit-holes/javascript/05-promise-error-flow/) |
| 标准、模块、兼容 | ES5/ES6、CommonJS/ESM、TypeScript/Babel、polyfill | [06](/rabbit-holes/javascript/06-modules-and-compatibility/) |
| 游戏运行时边界 | Cocos scheduler、JSB/native bridge、资源生命周期 | [01](/rabbit-holes/javascript/01-js-runtime/)、[02](/rabbit-holes/javascript/02-event-loop-vs-game-loop/)、[03](/rabbit-holes/javascript/03-memory-lifecycle/) |

## 母题

本洞继续印证 [../patterns.md](/rabbit-holes/patterns/) 里的"分层 + 封装"和"在更弱的底座上补出更强的抽象"：ECMAScript 只定义语言核心，真正能做事的应用能力由宿主环境和引擎调度在外面补齐。
