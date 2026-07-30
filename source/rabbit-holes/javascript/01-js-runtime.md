---
title: "JavaScript 运行时：语言本身很小，真正能做事的是宿主环境"
layout: page
comments: false
toc: true
permalink: /rabbit-holes/javascript/01-js-runtime/
---
[← 返回兔子洞总览](/rabbit-holes/) · [javascript 主题地图](/rabbit-holes/javascript/)

> JavaScript 运行时不是 JS 语法本身，而是"JS 引擎 + 宿主环境 + 事件循环 + 一组宿主 API"。引擎负责执行 ECMAScript；浏览器、Node.js 这类宿主负责补出定时器、网络、文件、DOM、任务队列等真实能力。

## 我追问的链

- JavaScript 到底是一门语言，还是一个能独立运行的程序？
- V8、Chrome、Node.js、浏览器运行时分别是谁？
- `setTimeout`、`fetch`、DOM、文件读写是 JS 自带的吗？
- 单线程的 JS 为什么能发网络请求、读文件、处理点击？
- `Promise.then` 为什么常常比 `setTimeout(..., 0)` 更早执行？
- GC 怎么判断对象能不能回收？闭包为什么会让变量一直活着？
- V8 和 JavaScriptCore 都执行 JS，为什么还会有差异？
- Cocos 里的 JSB / native bridge 又属于哪一层？
- polyfill、shim、adapter、fallback 都是在兼容，区别是什么？

## 1. 先分清三层：语言、引擎、运行时

平时说"JavaScript 会执行代码"，其实里面至少有三层：

```text
ECMAScript 语言规范
  ↓
JS 引擎：解析、编译、执行 JS
  ↓
运行时 / 宿主环境：给 JS 提供外部世界的能力
```

### ECMAScript：语言本身

ECMAScript 定义的是语言核心：

- 变量、函数、对象、原型、类。
- 作用域、闭包、`this`。
- `Promise`、`Map`、`Set`、`Array` 这些标准对象。
- 语法怎么解析，表达式怎么求值。

它关心的是：

> 这段 JS 代码按语言规则应该得到什么结果？

它不负责：

- 怎么操作网页 DOM。
- 怎么发 HTTP 请求。
- 怎么读写本地文件。
- 怎么监听鼠标点击。
- 怎么开定时器。

这些都不是语言核心，而是运行时给的能力。

### JS 引擎：执行语言的人

JS 引擎负责把 JS 代码跑起来。常见引擎：

- **V8**：Chrome、Edge、Node.js、Deno 都用过或正在用。
- **JavaScriptCore**：Safari 使用。
- **SpiderMonkey**：Firefox 使用。

引擎大致做这些事：

```text
JS 源码
  ↓
解析成 AST
  ↓
编译成字节码 / 机器码
  ↓
执行
  ↓
垃圾回收
```

所以 V8 很强，但 V8 不是浏览器，也不是 Node.js。V8 只是一台会执行 JS 语言的发动机。

### 运行时：把发动机装进一辆车

运行时是把 JS 引擎和外部能力装在一起的环境。

浏览器运行时大概是：

```text
Chrome
  ├─ V8：执行 JS
  ├─ DOM / CSSOM：网页结构和样式
  ├─ Web APIs：fetch、setTimeout、localStorage、事件监听
  ├─ 渲染引擎：排版、绘制、合成
  └─ 事件循环：调度同步代码、任务、微任务、渲染
```

Node.js 运行时大概是：

```text
Node.js
  ├─ V8：执行 JS
  ├─ libuv：事件循环、异步 I/O、线程池
  ├─ fs / net / http / crypto：服务端 API
  ├─ 模块系统：CommonJS / ESM
  └─ process / Buffer / stream：Node 特有能力
```

同一台 V8 发动机，装在 Chrome 里就能操作网页；装在 Node.js 里就能跑服务端、读文件、开 HTTP 服务器。

## 2. 哪些东西不是 JS 自带的

这段代码在浏览器里很自然：

```js
document.querySelector("#app").textContent = "hello";
```

但 `document` 不是 ECMAScript 的东西，它是浏览器给 JS 放进全局环境的对象。

这段代码在 Node.js 里很自然：

```js
import { readFile } from "node:fs/promises";

const text = await readFile("README.md", "utf8");
```

但 `fs` 也不是 ECMAScript 的东西，它是 Node.js 提供的模块。

所以可以这样分：

| 能力 | 属于谁 |
|---|---|
| `Array.prototype.map` | ECMAScript |
| `Promise` | ECMAScript |
| `document` / `window` | 浏览器运行时 |
| `fetch` | Web API；现代 Node.js 也实现了兼容版本 |
| `setTimeout` | 宿主环境提供 |
| `fs` / `process` / `Buffer` | Node.js 运行时 |

这解释了一个常见困惑：

> 为什么同一段 JS 在浏览器能跑，在 Node.js 报错？

因为语言一样，但宿主环境不一样。浏览器有 `document`，Node.js 默认没有；Node.js 有 `fs`，浏览器默认不能直接读你的硬盘文件。

## 3. 调用栈：同步代码一行一行跑

JS 主线程执行同步代码时，靠的是调用栈：

```js
function a() {
  b();
}

function b() {
  console.log("b");
}

a();
```

运行时大概是：

```text
push a()
  push b()
    push console.log()
    pop console.log()
  pop b()
pop a()
```

调用栈只有一个栈顶，所以同步 JS 看起来就是一行一行跑。某个函数一直不返回，后面的同步代码、点击事件、页面更新都要等。

这就是为什么死循环会卡住页面：

```js
while (true) {}
```

它一直占着调用栈，事件循环没机会切到后面的任务。

## 4. 单线程为什么还能异步

关键点是：**JS 主线程通常只有一个，但宿主环境不是只有一个能力。**

比如浏览器里：

```js
console.log("start");

setTimeout(() => {
  console.log("timer");
}, 1000);

console.log("end");
```

执行过程不是 JS 主线程自己睡 1 秒，而是：

```text
1. JS 执行 console.log("start")
2. JS 调用 setTimeout，把计时工作交给浏览器
3. JS 继续执行 console.log("end")
4. 浏览器计时到点，把回调放进任务队列
5. 调用栈清空后，事件循环取出回调执行
```

所以输出是：

```text
start
end
timer
```

异步不是魔法。它是运行时帮 JS 把耗时的等待交出去，等结果准备好，再把回调或 promise 反应排回来。

Node.js 也是类似思路，只是外部能力换成了 libuv、操作系统 I/O、线程池等：

```text
JS 主线程
  ↓ 发起 readFile
Node/libuv/系统 I/O 去等磁盘
  ↓ 完成后排回调
事件循环取回调给 JS 执行
```

## 5. 事件循环：什么时候轮到谁执行

事件循环要解决的是：

> 同步代码、定时器、网络回调、点击事件、Promise 回调都来了，到底先执行谁？

简化成浏览器里的模型：

```text
执行一个宏任务
  ↓
清空所有微任务
  ↓
必要时渲染页面
  ↓
取下一个宏任务
```

常见宏任务：

- 一整段 `<script>`。
- `setTimeout` / `setInterval` 回调。
- 用户点击、键盘事件。
- 网络事件回调。

常见微任务：

- `Promise.then` / `catch` / `finally`。
- `queueMicrotask`。
- `MutationObserver`。

看一个经典例子：

```js
console.log("A");

setTimeout(() => {
  console.log("B");
}, 0);

Promise.resolve().then(() => {
  console.log("C");
});

console.log("D");
```

输出是：

```text
A
D
C
B
```

原因：

1. 当前整段脚本是一个宏任务。
2. 同步代码先跑，所以打印 `A`、`D`。
3. `Promise.then` 进入微任务队列。
4. `setTimeout` 回调进入后续宏任务队列。
5. 当前宏任务结束后，先清空微任务，打印 `C`。
6. 再进入下一个宏任务，打印 `B`。

一句话：**同步代码先跑；当前任务结束后，微任务先清空；然后才轮到下一个宏任务。**

这个模型主要用来理解浏览器里的常见现象。Node.js 的事件循环还会细分 timer、poll、check 等阶段，细节更多，但核心问题仍然一样：同步调用栈先跑完，异步结果通过队列排回来。

## 6. `async/await` 只是 Promise 的更顺口写法

`async/await` 很像同步代码：

```js
async function main() {
  console.log("start");
  await fetch("/api/user");
  console.log("after fetch");
}
```

但它没有把 JS 线程卡在 `await` 那一行。它更接近：

```text
执行到 await
  ↓
把后半段函数挂到 Promise 后面
  ↓
先把主线程让出来
  ↓
Promise 解决后，把后半段作为微任务排回来
```

所以 `await` 的本质不是"阻塞线程等结果"，而是"暂停这个 async 函数，把控制权还给事件循环"。

这也是为什么 `await` 能让代码读起来像同步，但性能模型仍然是异步。

## 7. 浏览器运行时多了渲染这件事

浏览器和 Node.js 最大的差异之一是：浏览器还要把页面画出来。

一次页面更新大概会涉及：

```text
JS 修改 DOM / 样式
  ↓
样式计算
  ↓
布局
  ↓
绘制
  ↓
合成
  ↓
显示到屏幕
```

如果 JS 主线程一直忙，浏览器就没机会及时处理用户输入和渲染更新。用户感受到的就是：

- 页面卡住。
- 点击没反应。
- 动画掉帧。
- 输入框打字延迟。

所以前端性能里常说"别阻塞主线程"。真正的意思是：别让 JS 长时间霸占事件循环，让浏览器有机会处理输入和渲染。

## 8. Node.js 运行时多了系统 I/O 这件事

Node.js 的核心卖点是用 JS 写服务端程序。它给 JS 补了浏览器不会给的能力：

- 读写文件：`fs`。
- 建 TCP/HTTP 服务：`net`、`http`。
- 访问进程信息：`process`。
- 处理二进制数据：`Buffer`。
- 流式处理数据：`stream`。

Node.js 很适合 I/O 密集型服务，因为很多等待可以交给操作系统或 libuv：

```text
收到请求
  ↓
发起数据库 / 文件 / 网络 I/O
  ↓
JS 主线程继续处理别的请求
  ↓
I/O 完成后再回来执行回调
```

但如果你在 Node.js 里做很重的 CPU 计算，比如大循环压缩、加密、图片处理，也会卡住主线程。这个时候需要 worker threads、子进程、原生模块，或把任务交给专门服务。

## 9. GC：不是"用完就释放"，而是看还找不找得到

JavaScript 通常不用手动 `free` 内存。对象什么时候释放，由 JS 引擎的垃圾回收器，也就是 GC，决定。

GC 最核心的判断不是"这个对象以后还会不会用"，而是：

> 从根对象出发，还能不能沿着引用链找到它？

常见根对象包括：

- 全局对象，比如浏览器里的 `window`。
- 当前调用栈里的局部变量。
- 闭包里还被函数引用的变量。
- 运行时保存的回调、定时器、事件监听。
- 某些宿主对象或 native 侧还持有的引用。

比如：

```js
let user = { name: "Alice" };
let current = user;

user = null;
```

此时对象不一定能回收，因为 `current` 还指向它。

再比如：

```js
const cache = [];

function remember(node) {
  cache.push(node);
}
```

如果 `cache` 是全局可达的，里面塞过的对象也会跟着可达。即使页面上、场景里已经不用这个对象，只要引用链还在，GC 就不会把它当垃圾。

所以内存泄漏的本质往往不是"GC 坏了"，而是：

```text
业务上已经不用
  ↓
但某条引用链还连着
  ↓
GC 认为它还活着
```

在游戏和 UI 里，常见引用链是：

- 全局单例保存了页面对象。
- 事件总线保存了组件回调。
- 定时器保存了闭包。
- Promise / async 回调保存了上下文。
- native bridge 某侧保存了另一侧对象。

## 10. 闭包内存：函数结束了，变量不一定结束

闭包最容易被误解成"函数套函数"。更准确地说：

> 一个函数引用了外层作用域的变量，而这个函数又被外部保存下来，外层变量就会跟着活下去。

例子：

```js
function createCounter() {
  let count = 0;

  return function next() {
    count += 1;
    return count;
  };
}

const counter = createCounter();
counter();
counter();
```

`createCounter()` 已经执行完了，但 `count` 没消失。因为返回出来的 `next()` 还引用着它。

这不是问题，反而是 JS 很有用的能力。问题出在闭包不小心抓住了很大的对象：

```js
function bindPanel(panel) {
  window.addEventListener("resize", () => {
    panel.layout();
  });
}
```

这个箭头函数引用了 `panel`。只要监听没移除，运行时就要保存这个回调；只要回调还在，`panel` 就还可达。

在 UI / Cocos 里，类似问题常见于：

- `onLoad` 里绑定事件，`onDestroy` 没解绑。
- `setInterval` 开了，页面销毁时没 `clearInterval`。
- async 回调回来时，组件已经销毁，但闭包还拿着旧组件。
- 全局 manager 保存了某个节点、组件、回调。

### 重点：`bind` 生成新函数，解绑必须使用同一引用

下面这种写法看起来对称，实际上无法正确解绑：

```ts
this.node.on("click", this.onClick.bind(this));
this.node.off("click", this.onClick.bind(this));
```

原因是每次调用 `bind` 都会创建一个新的函数对象：

```ts
this.onClick.bind(this) !== this.onClick.bind(this); // true
```

事件系统解绑时匹配的是原来注册的函数引用。后一次 `bind` 得到的是另一个函数，所以找不到之前的监听器。如果组件反复启用并重复绑定，还可能积累多个监听器，让一次点击触发多次回调，并让回调引用的组件继续可达。

在 Cocos 中，优先使用事件接口提供的 `target` 参数：

```ts
onEnable() {
  this.node.on("click", this.onClick, this);
}

onDisable() {
  this.node.off("click", this.onClick, this);
}

private onClick() {
  console.log(this.node);
}
```

如果确实需要 `bind`，必须保存它返回的函数，并在绑定和解绑时复用同一个引用：

```ts
private readonly boundOnClick = this.onClick.bind(this);

onEnable() {
  this.node.on("click", this.boundOnClick);
}

onDisable() {
  this.node.off("click", this.boundOnClick);
}
```

记忆锚点：

> `bind` 可以用，但返回值必须保存；Cocos 事件优先传第三个 `target`。

所以判断闭包内存时，不要只问"函数是不是执行完了"，要问：

```text
有没有某个还活着的函数
  ↓
这个函数有没有抓住外层变量
  ↓
外层变量里有没有节点、资源、组件、纹理、数组等大对象
```

## 11. V8 / JSC 差异：标准相同，发动机不同

V8、JavaScriptCore、SpiderMonkey 都是在执行 ECMAScript。理想情况下，同一段标准 JS 在它们上面的结果应该一致。

但"结果一致"不等于"表现完全一样"。差异常见在这些地方：

| 维度 | 可能差异 |
|---|---|
| 语法 / API 支持 | 新标准落地时间不同，旧环境可能缺 API |
| JIT 优化 | 热代码怎么优化、什么时候反优化，各引擎策略不同 |
| GC 策略 | 回收时机、停顿时间、内存峰值表现不同 |
| 错误栈 | stack trace 格式和细节不同 |
| 调试工具 | Chrome DevTools、Safari Web Inspector 等体验不同 |
| 嵌入方式 | 游戏引擎、App、浏览器把 JS 引擎接进来的方式不同 |

比如：

- Chrome / Node.js 常见是 V8。
- Safari / iOS WebView 常见是 JavaScriptCore。
- Firefox 是 SpiderMonkey。
- 一些移动端或游戏运行时会根据平台、引擎版本选择不同 JS 引擎。

对业务开发来说，第一原则是写标准 JS，不依赖引擎怪癖。

但排查问题时，引擎差异很重要：

- 某个 API 在 A 平台有，在 B 平台没有，可能需要 polyfill。
- 某段代码在桌面很顺，在移动端卡，可能是 JIT / GC / bridge 成本不同。
- 某个内存峰值只在 iOS 出现，可能要看 JSC 和 native 侧的引用关系。

所以 V8 / JSC 的关系可以这样看：

```text
ECMAScript：交通规则
V8 / JSC：不同厂商造的车
运行时：车开在哪条路上
```

规则尽量一致，但车的性能、仪表盘、维修方式不一样。

## 12. JSB / native bridge：JS 怎么摸到原生世界

在浏览器里，JS 调 DOM、`fetch`、`setTimeout`，是因为浏览器这个宿主提供了 Web API。

在 Cocos 这类 native 游戏环境里，JS 运行在嵌入式 JS 引擎里。它想调用原生能力，就需要一座桥：

```text
JS 层 TypeScript / JavaScript
  ↓
JSB / native bridge
  ↓
C++ 引擎层
  ↓
Objective-C / Swift / Java / Kotlin
  ↓
iOS / Android 系统能力、SDK、渲染、文件、支付、分享
```

`jsb` 不是 ECMAScript 标准对象。它更像 `document`、`fs` 一样，是某个宿主运行时额外塞给 JS 的能力。

bridge 解决的是：

> JS 世界和 native 世界内存模型、对象模型、线程模型都不同，怎么互相调用？

代价也来自这里：

- **跨边界调用有成本**：频繁从 JS 调 native，或 native 频繁回调 JS，都可能比普通 JS 函数调用重。
- **数据要转换**：字符串、数组、对象、二进制数据可能要序列化、拷贝或包装。
- **生命周期更复杂**：JS 以为对象没人引用了，但 native 侧可能还持有；反过来也一样。
- **线程要对齐**：native 回调不一定天然就在 JS 主线程语义里，需要运行时调度。
- **平台行为可能不同**：iOS 和 Android 接的 SDK、权限、系统 API 不完全一样。

这就是为什么 Cocos / JSB 环境里的问题，常常不能只按"浏览器 JS"想：

```text
浏览器 JS：JS + Web API + 渲染引擎
Node.js：JS + libuv + 系统 I/O
Cocos native：JS + JSB + C++ 引擎 + 手机系统
```

语言核心一样，但宿主环境换了，很多边界就换了。

## 13. polyfill / shim / adapter / fallback：都是兼容，但方向不同

这些词都和兼容有关，但解决的问题不一样。

### polyfill：补标准 API

polyfill 的目标是：

> 环境没有某个标准 API，我补一个同名同用法的实现，让业务代码按新标准写。

典型形状：

```js
window.TextDecoder = window.TextDecoder || PolyfillTextDecoder;
```

意思是：有原生就用原生，没有就补一个。

### shim：垫一层兼容行为

shim 比 polyfill 更宽。它可以补标准 API，也可以垫一层非标准兼容逻辑。

如果 polyfill 像"把缺的标准零件补上"，shim 更像"中间垫一片，让新旧接口勉强对齐"。

### adapter：把一种接口改成另一种接口

adapter 重点不是"补缺失标准"，而是"统一接口"。

比如两个 SDK 调法不同：

```text
微信登录：wx.login(...)
抖音登录：tt.login(...)
项目内部：platform.login(...)
```

`platform.login()` 这一层就更像 adapter。它把不同平台适配成项目统一调用方式。

### fallback：主方案失败后的备用方案

fallback 是备用路径：

```text
优先用 WebP
  ↓ 不支持
退回 PNG
```

它不一定让旧环境"看起来支持新 API"，只是换一条能工作的路。

这几者放在一起：

```text
polyfill：补标准能力
shim：垫兼容层，范围更宽
adapter：统一不同接口
fallback：主路不通走备用路
```

## 逻辑闭环 / 锚点

JavaScript 的地基是 ECMAScript：它定义语言怎么运行，但不定义外部世界。

真正的闭环是：

```text
ECMAScript 定义语言
  ↓
JS 引擎执行语言
  ↓
宿主运行时提供外部能力
  ↓
事件循环把同步代码、异步结果、用户事件排队调度
  ↓
GC 根据引用链回收不可达对象
  ↓
native bridge 把 JS 世界接到系统和引擎世界
```

所以"JavaScript 运行时"不是一个单独零件，而是一套组合：

- 引擎让 JS 代码能算。
- 宿主让 JS 代码能碰到外部世界。
- 事件循环让等待和回调有秩序地回来。
- GC 管对象什么时候真正消失。
- bridge 让 JS 可以越过语言边界调用 native。

这也解释了为什么 JS 既能写网页，也能写服务端：语言核心相同，宿主能力不同。

## 关联

- 和 [HTTP / Cookie / Session](/rabbit-holes/networking/09-http-cache-cookie-session/) 一样，都是在一个更弱、更小的底座上补出应用真正需要的能力。
- 和 [分层与封装](/rabbit-holes/networking/03-layering/) 是同一个母题：语言、引擎、宿主、操作系统各管一层。
- 和 [数据库文件怎么存](/rabbit-holes/database/01-storage-pages-buffer-wal/) 也有相似结构：运行时不直接暴露底层细节，而是用缓存、队列、调度把复杂性封起来。
- 和 Cocos / 小游戏开发里的 polyfill、JSB、平台适配是一条线：语言核心很小，真正的工程能力靠宿主和兼容层补出来。

---

*来源：与 Codex 的对话，2026-07。*
