---
title: "ECMAScript、模块与兼容：四条轴不要混在一起"
layout: page
comments: false
toc: true
permalink: /rabbit-holes/javascript/06-modules-and-compatibility/
---
[← 返回兔子洞总览](/rabbit-holes/) · [javascript 主题地图](/rabbit-holes/javascript/)

> ES5、ES2015 说的是语言规范版本；CommonJS、ESM 说的是模块系统；TypeScript、Babel 负责转换代码；polyfill 负责补运行时 API。它们会在工程里同时出现，但解决的是四个不同问题。

## 我追问的链

- ECMAScript 和 JavaScript 是什么关系？
- ES5、ES6、ES202x 是 ESM 的版本吗？
- CommonJS 和 ESM 属于语言、运行时还是工具？
- `require` 和 `import` 为什么不能随便互换？
- TypeScript 编译后，旧环境就一定能运行吗？
- Babel 转换语法和 polyfill 补 API 有什么区别？
- 项目中的 `PolyfillURLSearchParams`、`PolyfillTextDecoder` 是给谁打补丁？
- shim、adapter、fallback 又分别处在哪一层？

## 1. 先分清四条正交轴

面对一个 JavaScript 工程，可以同时问四个问题：

| 轴 | 典型名词 | 回答的问题 |
|---|---|---|
| 语言版本 | ES5、ES2015、ES2023 | 代码能使用哪些语法和标准能力 |
| 模块系统 | CommonJS、ESM | 文件之间如何导入、导出和加载 |
| 转换工具 | TypeScript、Babel、bundler | 源码如何变成目标环境可执行代码 |
| 运行时兼容 | polyfill、shim、fallback | 目标环境缺少某个 API 时怎么办 |

所以：

```text
ES5 不是 ESM 的版本
ESM 也不是 ES6 的简称
```

它们只是名字都以 `ES` 开头，属于不同维度。

## 2. ECMAScript 是语言规范

JavaScript 是日常使用的语言名称，ECMAScript 是它遵循的标准规范。

ECMAScript 定义：

- 变量、函数、对象和类如何工作。
- 作用域、闭包和 `this` 的语义。
- 表达式如何求值。
- `Promise`、`Map`、`Set` 等标准对象。
- 模块语法以及其他语言特性。

浏览器、Node.js、Cocos 等运行时再在它上面提供自己的能力：

```text
ECMAScript
  → 语言规则

浏览器
  → DOM、fetch、localStorage

Node.js
  → fs、process、Buffer

Cocos / JSB
  → 节点、资源、渲染、native bridge
```

`document`、`fs`、`cc.Node` 都不是 ECMAScript 语言本身。

## 3. ES5、ES6、ES2015 是规范版本

ECMAScript 会持续发布新版本。

常见叫法：

```text
ES5
  → ECMAScript 第 5 版

ES6
  → ECMAScript 第 6 版
  → 后来采用年份命名，也叫 ES2015

ES2016、ES2017、ES2018...
  → 按年度发布

ESNext
  → 对下一批或未来标准特性的非正式称呼
```

ES5 时代常见代码：

```js
var self = this;

function Player(name) {
  this.name = name;
}

Player.prototype.sayHello = function () {
  console.log(this.name);
};
```

ES2015 引入或正式带来的一批重要能力包括：

```js
let value = 1;
const user = { name: "Alice" };

class Player {}

const names = users.map(user => user.name);

import { loadUser } from "./user.js";
```

后续版本又逐步加入：

- `async/await`
- 对象展开
- 可选链 `?.`
- 空值合并 `??`
- 私有字段 `#field`
- `Promise.any`
- `Array.prototype.at`

因此“目标是 ES5”通常表示：

> 最终输出代码尽量使用 ES5 环境能解析的语法。

它不表示工程必须使用 CommonJS，也不表示代码没有模块。

## 4. 语法支持和 API 支持是两回事

假设源码使用：

```ts
const result = await Promise.resolve(1);
```

里面包含两个不同问题：

```text
async/await
  → 语法和执行语义

Promise
  → 运行时标准对象
```

Babel 或 TypeScript 可以把某些新语法转换成旧语法，但不会凭空让旧运行时拥有所有新 API。

例如转换后可能仍然需要：

```js
Promise.resolve(1);
```

如果目标环境根本没有 `Promise`，代码仍然会报错，需要 polyfill。

记忆锚点：

```text
旧环境看不懂新写法
  → 转译语法

旧环境缺少新能力
  → polyfill API
```

## 5. 模块系统解决文件边界

没有模块系统时，多个脚本常依赖全局变量：

```html
<script src="config.js"></script>
<script src="request.js"></script>
<script src="main.js"></script>
```

问题包括：

- 名称容易冲突。
- 加载顺序成为隐含约束。
- 文件依赖不明确。
- 很难静态分析和复用。

模块系统要回答：

```text
这个文件导出了什么？
另一个文件依赖什么？
模块什么时候执行？
同一个模块会执行几次？
循环依赖如何处理？
```

CommonJS 和 ESM 都在解决这些问题，但规则不同。

## 6. CommonJS：运行时调用 `require`

CommonJS 常见于传统 Node.js：

```js
// math.js
function add(a, b) {
  return a + b;
}

module.exports = {
  add,
};
```

```js
// main.js
const { add } = require("./math");

console.log(add(1, 2));
```

核心对象：

- `require(...)`
- `module`
- `module.exports`
- `exports`

`require()` 是普通函数调用，因此可以写在条件和函数中：

```js
if (isDebug) {
  const debugTools = require("./debug-tools");
}
```

传统 CommonJS 加载通常是同步的。Node.js 第一次加载模块时执行模块代码，之后通常从模块缓存返回同一个 `module.exports`。

### `exports` 只是初始快捷引用

开始时可以粗略理解为：

```js
exports === module.exports;
```

所以这样有效：

```js
exports.add = add;
```

但直接重新赋值只改变局部变量 `exports`：

```js
exports = {
  add,
};
```

真正决定导出值的是：

```js
module.exports = {
  add,
};
```

## 7. ESM：标准化的 `import/export`

ES Module 使用：

```js
// math.js
export function add(a, b) {
  return a + b;
}

export const version = "1.0.0";
```

```js
// main.js
import { add, version } from "./math.js";
```

常见导出形式：

```js
export const value = 1;
export function run() {}
export default class Player {}
```

常见导入形式：

```js
import Player from "./Player.js";
import { run, value } from "./module.js";
import * as moduleApi from "./module.js";
```

ESM 的静态 `import` 通常位于模块顶层，模块依赖图可以在执行前分析：

```js
import { loadUser } from "./user.js";
```

需要运行时按条件加载时，可以使用动态导入：

```js
const module = await import("./debug-tools.js");
```

动态 `import()` 返回 Promise。

## 8. ESM 的导入是 live binding

ESM 导入不是简单复制一份当前值，而是绑定到导出模块中的变量：

```js
// counter.js
export let count = 0;

export function increase() {
  count += 1;
}
```

```js
// main.js
import { count, increase } from "./counter.js";

console.log(count); // 0
increase();
console.log(count); // 1
```

导入方不能直接给 `count` 重新赋值：

```js
count = 10; // TypeError
```

ESM 模块还默认使用严格模式。

## 9. CommonJS 与 ESM 的关键差异

| 维度 | CommonJS | ESM |
|---|---|---|
| 语法 | `require/module.exports` | `import/export` |
| 标准归属 | Node 社区模块约定 | ECMAScript 标准模块 |
| 依赖分析 | `require()` 可动态调用 | 静态 import 可预先分析 |
| 常见加载 | 传统实现同步 | 支持静态链接和异步加载模型 |
| 导出关系 | 导出 `module.exports` 对象/值 | 导入是 live binding |
| 严格模式 | 取决于代码设置 | 默认严格模式 |
| tree shaking | 较难可靠分析 | 静态结构更适合 |
| 浏览器原生支持 | 默认不支持 `require` | 支持 `<script type="module">` |

不要把它简化成“CommonJS 是旧语法，ESM 是新语法”。它们在加载、缓存、绑定和互操作上的规则也不同。

## 10. Node.js 怎么判断模块类型

在现代 Node.js 中，常见判断方式包括：

```text
.mjs
  → ESM

.cjs
  → CommonJS

package.json 中 "type": "module"
  → 该包范围内的 .js 默认按 ESM

package.json 中 "type": "commonjs"
  → 该包范围内的 .js 默认按 CommonJS
```

示例：

```json
{
  "type": "module"
}
```

同样是 `.js` 文件，在不同 package scope 中可能采用不同模块解释方式。

此外，包还可能通过 `exports` 为不同加载方式提供入口：

```json
{
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  }
}
```

这也是有些依赖在 `import` 和 `require` 下表现不同的原因。

## 11. CommonJS 与 ESM 互操作不是简单替换

下面两句看起来对应：

```js
const packageApi = require("some-package");
```

```js
import packageApi from "some-package";
```

但 default export、named export、`module.exports` 的映射要由 Node.js、bundler 或转换工具的互操作规则决定。

常见现象包括：

- `require()` 得到整个 `module.exports`。
- ESM default import 可能映射到 CommonJS 整体导出。
- named import 是否可用，取决于工具或运行时能否分析。
- 转译工具可能生成 `__esModule`、interop helper 等兼容代码。

遇到互操作问题时，应先确认：

```text
当前文件按 CJS 还是 ESM 解释？
依赖真正导出了什么？
代码由 Node、浏览器、Cocos 还是 bundler 加载？
中间是否经过 TypeScript/Babel 转换？
```

不要只靠修改大括号碰运气。

## 12. TypeScript 不等于一种运行时

TypeScript 在 JavaScript 上增加类型语法：

```ts
interface User {
  id: number;
  name: string;
}

function showUser(user: User): void {
  console.log(user.name);
}
```

运行前，类型通常会被擦除：

```js
function showUser(user) {
  console.log(user.name);
}
```

TypeScript 编译器可以：

- 检查类型。
- 去掉类型语法。
- 把部分新语法转换到目标版本。
- 按配置转换模块形式。

但 TypeScript 不会自动提供所有缺失的运行时 API：

```ts
new URLSearchParams();
new TextDecoder();
```

类型检查通过，只说明类型声明认为这些名字存在，不代表 Cocos、旧浏览器或 JSB 运行时真的实现了它们。

## 13. Babel、bundler 和 polyfill 各管一层

一个现代工程可能经历：

```text
TypeScript / 新版 JavaScript 源码
  ↓
TypeScript 或 Babel 转换语法
  ↓
bundler 解析模块图、合并和拆分产物
  ↓
目标运行时加载代码
  ↓
polyfill 补运行时缺失 API
```

职责可以这样区分：

| 工具/机制 | 主要职责 |
|---|---|
| TypeScript | 类型检查和语法转换 |
| Babel | JavaScript 语法转换 |
| bundler | 解析模块依赖、打包、拆包、资源处理 |
| polyfill | 在运行时补缺失的标准 API |

例如：

```ts
const names = users?.map(user => user.name) ?? [];
```

转换工具可以改写 `?.` 和 `??` 的语法。

但：

```ts
new TextDecoder();
```

是否存在，要看运行时或 polyfill。

## 14. 项目中的 polyfill 是运行时补丁

在 Cocos Creator 2.4.13 项目中：

```text
assets/Script/Core/Polyfill/
  ├─ PolyfillURLSearchParams.ts
  └─ PolyfillTextDecoder.ts
```

它们的核心安装方式是：

```ts
window.URLSearchParams =
  window.URLSearchParams || PolyfillURLSearchParams;
```

```ts
window.TextDecoder =
  window.TextDecoder || PolyfillTextDecoder;
```

语义是：

```text
运行时已经有原生实现
  → 保留原生实现

运行时缺少 API
  → 把兼容实现挂到同名全局位置
```

这样业务代码可以继续使用标准接口：

```ts
const params = new URLSearchParams(data).toString();
const text = new TextDecoder("utf-8").decode(buffer);
```

实际调用点包括：

- `assets/Script/Server/Http/request.ts`
- `assets/Script/Server/Socket/translator/JSONTranslator.ts`
- `assets/Script/Res/loader/ImageBufferLoader.ts`
- `assets/Script/Res/loader/SVGALoader.ts`

所以它们确实是在给项目运行时打补丁，但“polyfill”不是 JavaScript 特殊语法，也不是必须使用的目录名。

它是一种约定俗成的兼容做法：

> 缺少标准 API 时，提供同名、尽量同语义的实现。

## 15. polyfill、shim、adapter、fallback

### polyfill：补标准能力

```text
环境没有 TextDecoder
  → 安装兼容实现
  → 业务仍调用 new TextDecoder()
```

目标是让旧环境看起来拥有某个标准 API。

### shim：垫一层兼容行为

shim 范围更宽，不一定严格复刻标准 API。它可以修正行为、包装旧接口或建立过渡层。

### adapter：统一不同接口

```text
wx.login(...)
tt.login(...)
nativeLogin(...)
  ↓
platform.login(...)
```

adapter 不一定补标准，它把多个不同接口转换成项目内部的统一接口。

### fallback：主路失败时走备用路径

```text
优先 WebP
  ↓ 不支持
退回 PNG
```

fallback 不一定让旧环境拥有新能力，只保证还有另一条可用路径。

## 16. polyfill 也有边界

并不是所有能力都能靠 JavaScript polyfill 完整补出来。

容易补的通常是纯逻辑 API：

- 数组方法。
- 字符串方法。
- URL 参数解析。
- 文本编码转换。

难以完整补的通常依赖底层能力：

- 真正的多线程。
- GPU 功能。
- 浏览器渲染能力。
- 操作系统权限。
- 原生网络栈行为。
- 硬件编解码。

这种情况可能需要：

- adapter 调用另一套宿主 API。
- native bridge 补能力。
- fallback 换实现路径。
- 构建时排除不支持的平台。

polyfill 解决的是 API 兼容，不是无中生有地创造所有底层能力。

## 17. 模块路径还要由宿主或工具解析

相对路径：

```js
import { add } from "./math.js";
```

通常能直接定位文件。

裸模块名：

```js
import { debounce } from "lodash-es";
```

`"lodash-es"` 不是天然文件路径，需要环境定义解析规则：

- Node.js 查找 package。
- bundler 从 `node_modules` 和配置中解析。
- 浏览器原生 ESM 可能需要完整 URL 或 import map。
- Cocos 构建链按自己的模块和资源规则处理。

所以 ESM 只定义导入导出语义，不单独解决所有包查找问题。

## 18. 循环依赖为什么容易出问题

假设：

```text
A 导入 B
B 又导入 A
```

模块系统必须先建立依赖关系，再按各自规则初始化。

ESM 的 live binding 允许先建立绑定，但某个导出变量在初始化前访问可能触发错误。

CommonJS 常在模块执行过程中暴露尚未完成的 `module.exports`，另一侧可能拿到部分初始化结果。

循环依赖不一定立刻失败，但容易让初始化顺序变得隐蔽。

更可靠的处理是：

- 把共享类型、常量或基础函数抽到第三个低层模块。
- 避免模块顶层互相执行带副作用的初始化。
- 让依赖方向保持单向。

## 19. 怎么选择 CommonJS 或 ESM

新项目通常优先考虑 ESM，因为：

- 它是 ECMAScript 标准。
- 浏览器和现代 Node.js 原生支持。
- 静态结构更适合分析和 tree shaking。
- 前后端工具链逐渐以 ESM 为主。

但选择仍要服从现有环境：

- 老 Node.js 工具和配置可能仍以 CommonJS 为主。
- 某些 Cocos 版本、插件和构建链有自己的限制。
- 已有项目混用时，迁移成本可能高于收益。
- 发布库时可能需要同时提供 ESM 和 CommonJS 入口。

不要为了“新”而机械改写稳定工程。先确认运行时、构建工具、测试工具和依赖链是否一致支持。

## 20. 遇到兼容问题时的判断顺序

看到 `Unexpected token`：

```text
可能是环境无法解析语法
  → 检查 target、转译和模块解释方式
```

看到 `X is not defined` 或 `X is not a constructor`：

```text
可能是运行时缺 API
  → 检查宿主支持和 polyfill
```

看到 `Cannot use import statement outside a module`：

```text
文件没有按 ESM 解释
  → 检查扩展名、package.json type、加载方式
```

看到 `require is not defined`：

```text
当前环境不是 CommonJS
  → 检查是否在浏览器或 ESM 中直接使用 require
```

看到 default/named export 不匹配：

```text
可能是 CJS/ESM 互操作问题
  → 检查真实导出和工具生成结果
```

最终可以固定问四个问题：

```text
这是语言语法问题吗？
这是模块加载问题吗？
这是构建转换问题吗？
这是运行时 API 缺失吗？
```

## 逻辑闭环 / 锚点

一个 JavaScript 文件真正运行前，可能经过：

```text
用某个 ECMAScript 版本和 TypeScript 写源码
  ↓
使用 ESM 或 CommonJS 表达文件依赖
  ↓
TypeScript/Babel 转换语法
  ↓
bundler 按模块图生成产物
  ↓
浏览器、Node.js、Cocos 等宿主加载
  ↓
polyfill 补齐宿主缺少的标准 API
```

最重要的区分是：

```text
ES5 / ES2015
  → 语言版本

CommonJS / ESM
  → 模块系统

TypeScript / Babel / bundler
  → 构建转换

polyfill / shim / adapter / fallback
  → 运行时兼容策略
```

名字经常一起出现，但它们不属于同一条版本线。

## 关联

- [JavaScript 运行时](/rabbit-holes/javascript/01-js-runtime/)：ECMAScript、引擎和宿主环境的分层关系。
- [语言语义](/rabbit-holes/javascript/04-language-semantics/)：不同 ECMAScript 特性实际定义了什么行为。
- [Promise 与错误流](/rabbit-holes/javascript/05-promise-error-flow/)：模块动态导入为什么返回 Promise，以及异步加载错误如何传播。
- [工程化](/rabbit-holes/engineering/01-what-is-engineering/)：构建、依赖、质量门禁和发布如何把源码变成可交付产物。

---

*来源：与 Codex 的对话及 werewolf-minigame 实际代码，2026-07。*
