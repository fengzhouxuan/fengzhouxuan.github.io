---
title: "JavaScript 事件循环 vs 游戏帧循环：Promise 不是下一帧"
layout: page
comments: false
toc: true
permalink: /rabbit-holes/javascript/02-event-loop-vs-game-loop/
---
[← 返回兔子洞总览](/rabbit-holes/) · [javascript 主题地图](/rabbit-holes/javascript/)

> `Promise.then` / `await` 的后续逻辑属于 JS 微任务，它解决的是"当前同步代码结束后尽快继续"；游戏里的 `update`、`scheduleOnce`、渲染帧解决的是"下一次引擎帧循环什么时候到"。这两套调度经常挨在一起，但不是同一件事。

## 我追问的链

- `then` 一定会隔一帧吗？
- 微任务 / 宏任务到底是怎么定义出来的？
- `Promise.then` 为什么被放进微任务，是底层写死的吗？
- `await Promise.resolve()`、`setTimeout(..., 0)`、`scheduleOnce(..., 0)` 谁更早？
- Cocos 里的 `update` / `schedule` / 渲染帧，和 JS 事件循环是什么关系？
- 如果我只是想等布局、等节点刷新、等下一帧，应该用 Promise 还是引擎调度？

## 1. 先分清两套循环

这两个词长得都像"循环"，但管的不是同一层。

### JS 事件循环

JS 事件循环关心的是：

> JS 调用栈空了以后，下一段 JS 回调从哪个队列取出来执行？

简化模型：

```text
取一个宏任务
  ↓
执行同步 JS
  ↓
清空微任务
  ↓
交还控制权给宿主环境
  ↓
再取下一个宏任务
```

`Promise.then`、`await` 后半段、`queueMicrotask` 这类回调，走的是微任务。

`setTimeout`、事件回调、网络回调这类，通常可以理解成后续宏任务。

### 游戏帧循环

游戏帧循环关心的是：

> 引擎每一帧如何处理输入、组件更新、动画、布局、渲染？

非常简化地看：

```text
一帧开始
  ↓
处理输入 / native 事件 / 平台回调
  ↓
执行调度器里的定时回调
  ↓
调用组件 update(dt)
  ↓
推进动画 / tween / 物理 / 布局等引擎系统
  ↓
收集渲染数据
  ↓
提交给渲染层
  ↓
等待下一帧
```

不同引擎、不同版本、不同平台的细节会不同。这里的重点不是背精确顺序，而是先抓边界：

```text
JS 事件循环：决定 JS 回调队列怎么排
游戏帧循环：决定引擎每帧怎么推进世界和渲染
```

## 2. 微任务不是"下一帧"

看这个：

```js
console.log("A");

Promise.resolve().then(() => {
  console.log("B");
});

console.log("C");
```

输出是：

```text
A
C
B
```

`B` 没有同步执行，但它也不是等了一帧。它只是等当前同步调用栈结束，然后作为微任务尽快执行。

所以：

```text
Promise.then 不是"下一帧"
Promise.then 是"当前同步代码结束后的微任务"
```

如果当前这段 JS 是一帧中的某个回调，比如点击事件、资源加载回调、`update` 里触发的逻辑，那么 `then` 可能在这次 JS 回调返回宿主之前就跑掉。

这就是为什么用 `await Promise.resolve()` 不能当成"等 Cocos 下一帧"：

```ts
async function run() {
  console.log("before");
  await Promise.resolve();
  console.log("after");
}
```

`after` 只是被排成微任务。它通常比下一次引擎帧循环更早。

## 3. `await` 是暂停当前 async 函数，不是暂停游戏

`await` 很容易让人误以为"停一下"：

```ts
async function openPanel() {
  this.node.active = true;
  await Promise.resolve();
  this.refreshLayout();
}
```

这里真正发生的是：

```text
执行到 await
  ↓
把 await 后面的代码拆成 Promise 后续回调
  ↓
当前 async 函数先返回一个 Promise
  ↓
当前同步栈结束后，微任务继续执行 refreshLayout
```

它没有保证：

- 引擎已经跑完下一帧。
- 节点布局已经重新计算。
- 渲染已经提交。
- 动画已经走过一个 frame。

所以如果你的真实目的叫"等 JS 当前栈结束"，`await Promise.resolve()` 合适。

如果你的真实目的叫"等引擎下一帧"，它通常不是你想要的工具。

## 4. `setTimeout(..., 0)` 也不等于下一帧

`setTimeout(fn, 0)` 常被拿来"延后一下"：

```js
setTimeout(() => {
  console.log("timer");
}, 0);
```

它的意思更接近：

> 把回调放到后续 timer 任务里，最快等当前任务结束后再执行。

但它不承诺：

- 一定下一帧执行。
- 一定在渲染前执行。
- 一定在渲染后执行。
- 在所有小游戏 / native 运行时里时机完全一致。

它只是宿主环境的定时器队列，不是游戏引擎帧调度器。

在浏览器里，它通常比微任务晚：

```js
Promise.resolve().then(() => console.log("microtask"));
setTimeout(() => console.log("timer"), 0);
console.log("sync");
```

常见输出：

```text
sync
microtask
timer
```

但"timer 晚于 microtask"不等于"timer 就是下一帧"。如果你关心的是帧，要找帧 API。

## 5. `scheduleOnce(..., 0)` 更像"交给引擎下一轮调度"

Cocos 里常见：

```ts
this.scheduleOnce(() => {
  this.refreshList();
}, 0);
```

它和 Promise 的语义完全不一样。

```text
Promise.then
  ↓
JS 微任务队列
  ↓
当前同步代码结束后尽快执行

scheduleOnce(..., 0)
  ↓
Cocos scheduler
  ↓
等引擎调度器下一次处理这个组件的定时回调
```

所以它常被用在这类场景：

- 当前节点树刚改完，等引擎后续系统处理。
- 列表、滚动、布局需要推迟到下一次调度。
- 避免在当前回调里立刻递归刷新。
- 等组件 enable / layout / size 变化传播一轮。

更直白地说：

```text
想等 JS 当前栈结束：Promise 微任务
想等引擎帧/调度器：scheduleOnce
```

不过也要留一个边界：`scheduleOnce(..., 0)` 是 Cocos scheduler 的语义，不是 ECMAScript 标准。具体在一帧中的哪一步执行，要看 Cocos 版本和宿主平台。

## 6. `requestAnimationFrame` 是浏览器帧，不是通用游戏帧

浏览器里还有：

```js
requestAnimationFrame(() => {
  // 下一次浏览器准备绘制前执行
});
```

它更贴近浏览器的渲染帧。

但在 Cocos native、小程序游戏环境里，不要默认把 `requestAnimationFrame` 当作唯一可靠的引擎帧 API。它可能由宿主实现，也可能和引擎自己的主循环有封装关系。

游戏项目里更稳的习惯是：

```text
浏览器页面动画：优先理解 requestAnimationFrame
Cocos 组件逻辑：优先理解 update / schedule / scheduleOnce
资源和平台回调：看引擎与宿主怎么把结果派回 JS
```

## 7. 几种"等一下"到底等的是什么

把常见写法放一起看：

| 写法 | 等的是什么 | 常见用途 |
|---|---|---|
| `Promise.resolve().then(fn)` | 当前同步栈结束后的微任务 | 让当前函数先结束，马上接后续逻辑 |
| `await Promise.resolve()` | 当前 async 函数后半段进入微任务 | 拆开同步流程，不等下一帧 |
| `setTimeout(fn, 0)` | 后续 timer 宏任务 | 粗略延后，不保证帧时机 |
| `requestAnimationFrame(fn)` | 浏览器下一次绘制前 | Web 页面视觉更新 |
| `this.scheduleOnce(fn, 0)` | Cocos scheduler 后续调度 | 等引擎下一轮处理组件逻辑 |
| `update(dt)` | 每帧组件更新 | 持续推进游戏状态 |

这张表最重要的不是背 API，而是识别意图：

```text
我要等 JS 队列？
我要等宿主定时器？
我要等浏览器绘制？
我要等游戏引擎下一帧？
```

问清楚这个，API 选择就不会乱。

## 8. 一个完整时序例子

假设某一帧里，一个按钮点击回调执行：

```ts
onClick() {
  console.log("click start");

  Promise.resolve().then(() => {
    console.log("promise");
  });

  setTimeout(() => {
    console.log("timeout");
  }, 0);

  this.scheduleOnce(() => {
    console.log("scheduleOnce");
  }, 0);

  console.log("click end");
}
```

能确定的是：

```text
click start
click end
promise
```

因为同步代码先跑，微任务随后清空。

后面的 `timeout` 和 `scheduleOnce`，哪个先出现，要看宿主 timer 和 Cocos scheduler 在当前平台的调度关系。很多时候 `scheduleOnce(..., 0)` 会落到引擎下一轮调度，而 `setTimeout(..., 0)` 走宿主 timer；它们不是同一个队列，不应该互相当作严格替代品。

所以这类代码里，真正可靠的判断是：

```text
Promise 微任务最适合表达"当前 JS 栈后续"
scheduleOnce 最适合表达"Cocos 调度后续"
setTimeout 最适合表达"宿主定时器后续"
```

## 9. 常见误区

### 误区一：`await` 一定让出一帧

不一定。

```ts
await Promise.resolve();
```

通常只是让出到微任务，不等一帧。

### 误区二：`setTimeout(..., 0)` 就是下一帧

不是。它是 timer 宏任务，不是帧 API。

### 误区三：`Promise.then` 可以等布局刷新

通常不可靠。布局、尺寸、渲染这类引擎状态，应该用引擎提供的调度点来等。

### 误区四：微任务越多越好

微任务会在进入下一个宏任务或交还控制权之前尽量清空。如果你递归制造大量微任务，可能让宿主迟迟没机会进入下一步，引擎帧也会被拖住。

```js
function loop() {
  Promise.resolve().then(loop);
}

loop();
```

这种代码会不断塞微任务，让外部事件和帧调度很难插进来。

## 10. 工程判断：先问目的，再选队列

遇到"这里要不要 await 一下 / schedule 一下"时，可以按这个顺序问：

```text
1. 我只是要等当前同步代码结束吗？
   → Promise 微任务

2. 我要等一个真实异步结果吗？
   → await 那个真实 Promise，比如请求、资源加载、native 回调

3. 我要等下一次引擎处理节点、布局、滚动、动画吗？
   → Cocos 的 scheduleOnce / update / 引擎事件

4. 我只是要做超时保护或延迟 N 毫秒吗？
   → setTimeout 或项目封装的 timeout 工具

5. 我在浏览器页面里等视觉刷新吗？
   → requestAnimationFrame
```

这比记"谁先谁后"更有用。因为一旦跨到 Cocos native、小程序、JSB，宿主和引擎的细节会变，但意图分类依然稳定。

## 逻辑闭环 / 锚点

事件循环和游戏帧循环的关系不是上下级完全包含，而是两套调度协作：

```text
JS 引擎
  ↓
执行同步代码、清空微任务
  ↓
宿主运行时
  ↓
派发 timer、网络、native 回调
  ↓
Cocos 引擎主循环
  ↓
推进 update、scheduler、动画、渲染
```

`Promise.then` 是 JS 层的"当前任务收尾"机制；`scheduleOnce` 是引擎层的"后续帧/调度"机制。它们都叫"异步"，但等的不是同一个东西。

一句话闭环：

> 微任务解决 JS 流程衔接；帧循环解决游戏世界推进。要等哪一层，就用哪一层的调度工具。

## 关联

- [JavaScript 运行时](/rabbit-holes/javascript/01-js-runtime/)：本篇把上一章里的事件循环继续追到游戏帧循环。
- [分层与封装](/rabbit-holes/networking/03-layering/)：JS 引擎、宿主运行时、Cocos 引擎各自调度自己的那一层。
- 母题 [分层 + 封装](/rabbit-holes/patterns/)：不要把 JS 微任务、宿主 timer、游戏 scheduler 混成一个"延后执行"概念。

---

*来源：与 Codex 的对话，2026-07。*
