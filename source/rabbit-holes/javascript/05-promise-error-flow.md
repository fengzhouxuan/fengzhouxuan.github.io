---
title: "Promise 与错误流：异步结果也要像返回值一样传播"
layout: page
comments: false
toc: true
permalink: /rabbit-holes/javascript/05-promise-error-flow/
---
[← 返回兔子洞总览](/rabbit-holes/) · [javascript 主题地图](/rabbit-holes/javascript/)

> Promise 不是“让代码异步执行”的按钮，而是一个代表未来结果的对象。它把成功值和失败原因沿链传递；`try/catch` 则处理当前调用链中的抛出，`await` 把 Promise rejection 重新接回当前 async 函数的错误流。

## 我追问的链

- `new Promise(...)` 里的代码是立即执行，还是以后执行？
- Promise 为什么只有三个状态？状态能改回去吗？
- `then` 为什么总是返回一个新 Promise？
- `then` 返回普通值、Promise 或抛出异常，后面分别收到什么？
- `catch` 到底捕获的是谁的错误？
- `try/catch` 是否必须遇到 `throw` 才会执行？
- 为什么 timer、事件和没有 `await` 的 Promise 捕获不到？
- `return new Error()` 和 `throw new Error()` 有什么区别？
- `Promise.all`、`allSettled`、`race`、`any` 应该怎么选？

## 1. Promise 是未来结果的容器

普通函数立即返回一个值：

```ts
function getUser() {
  return { id: 1, name: "Alice" };
}
```

网络请求暂时没有结果，所以先返回一个 Promise：

```ts
function getUser(): Promise<User> {
  return request("/api/user");
}
```

Promise 表达的是：

```text
现在：结果还没出来
未来：要么得到成功值，要么得到失败原因
```

调用方不用知道网络、文件、定时器还是 native bridge 在工作，只需要围绕这个未来结果继续组织代码。

## 2. Promise 状态机

Promise 只有三种状态：

```text
pending
  ├─ fulfilled(value)
  └─ rejected(reason)
```

- `pending`：结果尚未确定。
- `fulfilled`：成功，并保存一个值。
- `rejected`：失败，并保存一个原因。

一旦从 `pending` 变成 fulfilled 或 rejected，就不能再次改变：

```ts
const promise = new Promise((resolve, reject) => {
  resolve("first");
  reject(new Error("second"));
  resolve("third");
});

promise.then(console.log); // first
```

第一次确定结果后，后续 `resolve` 或 `reject` 不再改变这个 Promise。

这里经常说 Promise 被 settled，表示它已经 fulfilled 或 rejected。

## 3. executor 是同步执行的

`new Promise(executor)` 中的 executor 会立刻执行：

```ts
console.log("A");

const promise = new Promise(resolve => {
  console.log("B");
  resolve("done");
});

console.log("C");
```

输出：

```text
A
B
C
```

真正进入微任务的是 `then` 回调：

```ts
console.log("A");

Promise.resolve().then(() => {
  console.log("B");
});

console.log("C");
```

输出：

```text
A
C
B
```

所以需要分清：

```text
创建 Promise、执行 executor
  → 同步

执行 then/catch/finally 回调
  → 微任务
```

Promise 本身不负责把网络请求变成异步。真正的异步能力来自浏览器、Node.js、Cocos 或 native 宿主；Promise 负责统一表示结果。

## 4. `resolve` 不一定等于立即 fulfilled

传入普通值时：

```ts
resolve(123);
```

Promise 会以 `123` fulfilled。

但传入另一个 Promise 或 thenable 时，外层 Promise 会采用它的最终状态：

```ts
const inner = new Promise<string>(resolve => {
  setTimeout(() => resolve("done"), 100);
});

const outer = new Promise(resolve => {
  resolve(inner);
});
```

`outer` 不会以 `inner` 这个对象作为普通成功值立刻结束，而是等待 `inner`：

```text
inner fulfilled("done")
  ↓
outer fulfilled("done")
```

这类行为叫 Promise resolution procedure。它让不同来源的 Promise 可以自然地拼接成一条链。

## 5. `then` 总是返回一个新 Promise

```ts
const p1 = Promise.resolve(1);
const p2 = p1.then(value => value + 1);

p1 === p2; // false
```

之所以返回新 Promise，是因为回调执行后可能产生新的未来结果：

```ts
const userPromise = getToken()
  .then(token => getUser(token))
  .then(user => loadAvatar(user));
```

每个 `then` 都代表链上的下一阶段。

回调结果决定新 Promise 的状态。

### 返回普通值

```ts
Promise.resolve(1)
  .then(value => value + 1)
  .then(value => {
    console.log(value); // 2
  });
```

返回普通值会让下一个 Promise fulfilled。

### 返回 Promise

```ts
getToken()
  .then(token => {
    return getUser(token);
  })
  .then(user => {
    console.log(user);
  });
```

链会等待返回的 Promise，不会得到一个嵌套的 `Promise<Promise<User>>`。

### 抛出异常

```ts
Promise.resolve("bad json")
  .then(text => {
    return JSON.parse(text);
  })
  .catch(error => {
    console.error("解析失败", error);
  });
```

回调中抛出的异常会让 `then` 返回的新 Promise rejected。

### 什么都不返回

```ts
Promise.resolve(1)
  .then(value => {
    console.log(value);
  })
  .then(value => {
    console.log(value); // undefined
  });
```

函数没有显式返回值，相当于返回 `undefined`。

记忆锚点：

```text
then 回调返回普通值
  → 下一环成功，值就是返回值

then 回调返回 Promise
  → 下一环等待它

then 回调 throw
  → 下一环失败

then 回调没有 return
  → 下一环成功，值是 undefined
```

## 6. 值和错误都会穿透

如果 `then` 没有成功处理函数，成功值会继续向后传：

```ts
Promise.resolve(1)
  .then()
  .then(value => console.log(value)); // 1
```

如果链中暂时没有失败处理函数，错误也会继续向后传：

```ts
Promise.reject(new Error("failed"))
  .then(value => value + 1)
  .then(value => value + 1)
  .catch(error => {
    console.error(error);
  });
```

因此一段异步流程可以把错误集中交给后面的 `catch`。

但错误被 `catch` 处理后，如果正常返回，链会恢复为 fulfilled：

```ts
Promise.reject(new Error("failed"))
  .catch(error => {
    console.error(error);
    return "fallback";
  })
  .then(value => {
    console.log(value); // fallback
  });
```

如果不能真正恢复，应继续抛出：

```ts
.catch(error => {
  logError(error);
  throw error;
});
```

## 7. `catch` 和 `then` 的关系

下面两种写法接近：

```ts
promise.catch(onRejected);
```

```ts
promise.then(undefined, onRejected);
```

但这两种写法有重要差异：

```ts
promise.then(onFulfilled, onRejected);
```

这里的 `onRejected` 处理的是 `promise` 原本的失败。它不能捕获同一个 `then` 中 `onFulfilled` 新抛出的异常，因为那个异常属于 `then` 返回的新 Promise。

更稳妥的链式写法是：

```ts
promise
  .then(onFulfilled)
  .catch(onRejected);
```

这样 `catch` 能处理原 Promise 的失败，也能处理 `onFulfilled` 中的新异常。

## 8. `finally` 不处理结果，只处理收尾

Promise 的 `finally` 无论成功失败都会执行：

```ts
showLoading();

loadData()
  .then(render)
  .catch(showError)
  .finally(hideLoading);
```

`finally` 不接收成功值或失败原因：

```ts
promise.finally(() => {
  // 不关心前面成功还是失败
});
```

正常返回时，它通常不会替换原结果：

```ts
Promise.resolve(1)
  .finally(() => 999)
  .then(console.log); // 1
```

但如果 `finally` 抛错或返回 rejected Promise，会用新错误覆盖原结果：

```ts
Promise.resolve(1)
  .finally(() => {
    throw new Error("cleanup failed");
  })
  .catch(console.error);
```

因此 `finally` 适合释放临时锁、关闭 loading、归还临时资源，不应该随意改变主流程。

## 9. `throw` 是异常流的入口

`catch` 只有遇到被抛出的异常才会执行，但这个 `throw` 不一定由业务代码显式写出。

显式抛出：

```ts
throw new Error("配置不存在");
```

引擎或 API 内部抛出：

```ts
JSON.parse("bad json"); // SyntaxError

const user = null;
user.name; // TypeError
```

它们都会产生异常完成，运行时沿当前调用栈寻找最近的 `catch`。

```ts
function parseConfig(text: string) {
  return JSON.parse(text);
}

function loadConfig(text: string) {
  return parseConfig(text);
}

try {
  loadConfig("bad json");
} catch (error) {
  console.error(error);
}
```

传播过程：

```text
JSON.parse 抛错
  ↓
parseConfig 中止
  ↓
loadConfig 中止
  ↓
找到外层 catch
```

没有找到 `catch` 时，异常会交给当前宿主环境的未捕获错误处理机制。

## 10. `return Error` 不等于 `throw Error`

返回一个 Error 对象仍然是正常返回：

```ts
function loadConfig() {
  return new Error("failed");
}

try {
  const result = loadConfig();
  console.log(result); // Error 对象
} catch (error) {
  // 不会执行
}
```

抛出才会进入异常流：

```ts
function loadConfig() {
  throw new Error("failed");
}
```

同样，返回一个失败状态也不会触发 `catch`：

```ts
return {
  success: false,
  message: "failed",
};
```

这两种错误表达都可以使用，但调用约定不同：

```text
返回 Result
  → 调用方检查 success / ok

抛出 Error
  → 调用方使用 try/catch 或 Promise catch
```

不要返回一个 Error 对象，却又期待调用方自动进入 `catch`。

## 11. `try/catch` 只覆盖当前调用链

同步调用可以被外层捕获：

```ts
try {
  run();
} catch (error) {
  console.error(error);
}
```

定时器回调之后在新的任务中执行：

```ts
try {
  setTimeout(() => {
    throw new Error("later");
  }, 0);
} catch (error) {
  // 捕获不到
}
```

执行顺序是：

```text
注册 timer
  ↓
try 已经结束
  ↓
后续任务执行回调
  ↓
原 catch 已不在调用栈中
```

事件回调也是同样的边界：

```ts
try {
  this.node.on("click", this.onClick, this);
} catch (error) {
  // 捕获不到未来 onClick 中的错误
}
```

需要在回调内部处理，或者让回调返回的 Promise 被明确观察。

## 12. Promise rejection 不是外层同步 `catch`

Promise executor 中抛出的异常会被转换为 rejection：

```ts
const promise = new Promise(() => {
  throw new Error("failed");
});
```

但下面的同步 `try/catch` 捕获不到：

```ts
try {
  Promise.reject(new Error("failed"));
} catch (error) {
  // 不会执行
}
```

因为创建 rejected Promise 本身是正常返回了一个 Promise 对象。失败状态需要通过 Promise 链观察：

```ts
Promise.reject(new Error("failed"))
  .catch(error => {
    console.error(error);
  });
```

或者通过 `await`：

```ts
try {
  await Promise.reject(new Error("failed"));
} catch (error) {
  console.error(error);
}
```

`await` 会在当前 async 函数中把 rejection 表现为一次抛出，因此附近的 `catch` 可以捕获。

## 13. `async` 函数的错误一定变成 rejected Promise

`async` 函数总是返回 Promise：

```ts
async function getValue() {
  return 1;
}
```

等价结果是 fulfilled Promise：

```ts
getValue().then(value => console.log(value)); // 1
```

`async` 函数内部抛错：

```ts
async function getValue() {
  throw new Error("failed");
}
```

调用它不会同步向调用方抛出，而是返回 rejected Promise：

```ts
const promise = getValue();
promise.catch(console.error);
```

因此 Cocos 事件系统如果不关心回调返回值，这种写法可能留下未处理 rejection：

```ts
private async onClick() {
  await this.submit();
}
```

更明确的边界是：

```ts
private onClick() {
  void this.submit().catch(error => {
    cc.error("提交失败", error);
  });
}
```

或者让 `onClick` 自己在内部 `try/catch`。

## 14. 只处理能够处理的错误

空 `catch` 会让真实问题消失：

```ts
try {
  await loadData();
} catch (error) {
  // 什么都不做
}
```

更合理的处理分为三类：

```text
能够恢复
  → 默认值、重试、降级

需要补充上下文
  → 包装后重新抛出

完全处理不了
  → 保留原错误继续抛出
```

例如：

```ts
try {
  return await loadConfig();
} catch (error) {
  if (error instanceof ConfigNotFoundError) {
    return defaultConfig;
  }

  throw error;
}
```

包装错误时可以保留原始原因：

```ts
try {
  await requestConfig();
} catch (error) {
  throw new Error("初始化配置失败", {
    cause: error,
  });
}
```

错误信息应该补充上下文，但不要泄露 token、密码、完整请求头等敏感内容。

## 15. 自定义 Error 表达可识别的失败

```ts
class ConfigError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ConfigError";
  }
}
```

调用方可以按错误类型决定是否恢复：

```ts
try {
  await loadConfig();
} catch (error) {
  if (error instanceof ConfigError) {
    showConfigGuide();
    return;
  }

  throw error;
}
```

不要只依赖错误文案字符串进行分支：

```ts
if (error.message === "配置失败") {
  // 文案变化就会破坏逻辑
}
```

## 16. 四种 Promise 组合

### `Promise.all`：全部成功，任一失败就失败

```ts
const [user, inventory] = await Promise.all([
  loadUser(),
  loadInventory(),
]);
```

适合多个结果都必需的场景。

其中一个 rejected 后，`Promise.all` 会尽快 rejected，但其他底层任务不会自动取消。

### `Promise.allSettled`：等待全部结束

```ts
const results = await Promise.allSettled([
  loadAvatar(),
  loadBadge(),
]);
```

每项结果分别包含 fulfilled 或 rejected 状态。适合允许部分失败的批量任务。

### `Promise.race`：第一个结束的结果

```ts
const result = await Promise.race([
  requestData(),
  timeout(3000),
]);
```

第一个 settled 的 Promise 决定结果，不论成功还是失败。输掉竞赛的任务同样不会自动取消。

### `Promise.any`：第一个成功的结果

```ts
const data = await Promise.any([
  requestFromA(),
  requestFromB(),
]);
```

只要有一个 fulfilled 就成功；全部失败时以 `AggregateError` rejected。

## 17. Promise 没有通用的自动取消

丢弃 Promise 引用不等于取消底层任务：

```ts
let promise = requestData();
promise = null;
```

网络、定时器或 native 工作可能仍然继续。

取消必须由底层能力配合：

```ts
const controller = new AbortController();

fetch(url, {
  signal: controller.signal,
});

controller.abort();
```

不支持真正取消时，可以让结果失效：

```ts
const requestId = ++this.requestId;
const data = await loadData();

if (requestId !== this.requestId) {
  return;
}
```

这能阻止旧结果更新页面，但不代表底层请求没有继续消耗资源。

## 18. 常见 Promise 陷阱

### 忘记 `return`

```ts
loadToken()
  .then(token => {
    loadUser(token); // 没有 return
  })
  .then(user => {
    console.log(user); // undefined
  });
```

应该返回：

```ts
return loadUser(token);
```

### 使用 `new Promise(async executor)`

```ts
new Promise(async (resolve, reject) => {
  const data = await loadData();
  resolve(data);
});
```

通常没有必要，而且 async executor 的错误边界容易变得混乱。已有 Promise 时直接返回：

```ts
async function run() {
  return await loadData();
}
```

甚至：

```ts
function run() {
  return loadData();
}
```

### 没有观察 rejected Promise

```ts
void submit();
```

如果 `submit()` 失败，可能产生未处理 rejection。应明确选择：

```ts
await submit();
```

或者：

```ts
void submit().catch(reportError);
```

## 逻辑闭环 / 锚点

Promise 链本质上是在传递两条通道：

```text
成功值
  → then
  → 返回值决定下一环

失败原因
  → catch
  → 恢复或继续抛出
```

`async/await` 没有改变底层模型：

```text
await Promise
  ↓
fulfilled → 得到值
rejected  → 在当前 async 函数中 throw
```

最重要的判断顺序是：

```text
这个函数返回普通值还是 Promise？
失败是返回状态、throw，还是 Promise rejection？
当前 catch 是否仍在同一调用链？
这个 Promise 是否被 await、return 或 catch？
底层任务是否需要取消，而不只是丢弃结果？
```

## 关联

- [事件循环 vs 游戏帧循环](/rabbit-holes/javascript/02-event-loop-vs-game-loop/)：Promise 回调进入微任务，但不代表等待一帧。
- [内存与生命周期](/rabbit-holes/javascript/03-memory-lifecycle/)：等待中的异步流程如何保存回调和对象引用。
- [语言语义](/rabbit-holes/javascript/04-language-semantics/)：普通返回、`throw`、`this` 和闭包是 Promise 链继续工作的语言基础。

---

*来源：与 Codex 的对话，2026-07。*
