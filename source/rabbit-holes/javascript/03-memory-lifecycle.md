---
title: "JavaScript 内存与生命周期：GC 只知道对象是否可达"
layout: page
comments: false
toc: true
permalink: /rabbit-holes/javascript/03-memory-lifecycle/
---
[← 返回兔子洞总览](/rabbit-holes/) · [javascript 主题地图](/rabbit-holes/javascript/)

> JavaScript 的 GC 不理解业务上的“已经不用了”，它只沿着引用链判断对象还能不能从根节点找到。真正可靠的生命周期管理，需要让业务状态、JS 引用和宿主 / native 资源同时结束。

## 我追问的链

- 函数执行完了，里面创建的对象为什么不一定释放？
- `obj = null` 到底做了什么？
- GC 怎么知道哪些对象是垃圾？
- 循环引用为什么也可以回收？
- 标记清扫、复制、整理、分代回收分别解决什么问题？
- 闭包、事件监听、定时器为什么容易留住组件？
- Promise 回来时组件已经销毁，属于内存泄漏吗？
- Cocos 中节点销毁后，纹理和 native 对象也一定释放了吗？
- `try/finally` 和组件生命周期分别适合清理什么？

## 1. 先分清三个“生命周期”

讨论 JavaScript 内存时，最容易把三个问题混在一起：

| 维度 | 回答的问题 |
|---|---|
| 作用域 | 变量名在代码的什么位置可见 |
| GC 可达性 | 对象还能不能从根引用找到 |
| 业务生命周期 | 对象现在是否还应该继续工作 |

例如：

```ts
async function openPanel() {
  const panel = createPanel();
  const data = await loadData();
  panel.render(data);
}
```

`openPanel` 暂停等待时：

- `panel` 仍然属于这个异步函数的执行上下文。
- Promise 后续逻辑仍然需要 `panel`。
- 即使玩家已经关闭页面，GC 也不能因此猜出 `panel` 没有业务价值。

所以一个对象可能处于这种状态：

```text
业务上已经失效
  ↓
引用关系仍然存在
  ↓
GC 判断它还活着
```

内存与生命周期管理的目标，就是让这三个维度重新对齐。

## 2. 对象不是按作用域回收，而是按可达性回收

JavaScript 创建的对象通常放在引擎管理的堆中：

```ts
let player = {
  name: "Alice",
  inventory: ["sword"],
};
```

引用关系可以简化成：

```text
当前调用栈里的 player
  ↓
Player 对象
  ↓
inventory 数组
```

GC 会从一组确定存活的入口开始查找对象，这些入口通常称为 GC Roots。常见 Roots 包括：

- 全局对象和模块级变量。
- 当前调用栈中的局部变量和参数。
- 正在执行或暂停等待的函数上下文。
- 运行时保存的事件、定时器和异步回调。
- 引擎、浏览器或 native 侧持有的引用。

只要从这些根出发还能找到对象，它就不能被当成垃圾。

```ts
let player = { name: "Alice" };
let currentPlayer = player;

player = null;
```

`player = null` 只断开了一条引用：

```text
currentPlayer
  ↓
Player 对象
```

对象仍然可达，所以不能回收。只有其他强引用也消失后，它才有资格被 GC 回收。

记忆锚点：

> `obj = null` 不是释放对象，只是断开一条引用。

## 3. GC 的主流程：标记、清扫、整理

现代 JavaScript 引擎主要使用追踪式 GC。最核心的过程可以简化为：

```text
从 GC Roots 出发
  ↓
标记所有可达对象
  ↓
未被标记的对象就是垃圾
  ↓
回收或整理对应内存
```

### 标记：遍历活对象

假设堆中的引用图是：

```text
Roots
  ├─ A
  │  └─ B
  └─ C

D ⇄ E
```

GC 从 Roots 出发能找到 `A`、`B`、`C`，因此标记它们。`D` 和 `E` 虽然互相引用，但整个小团体无法从 Roots 到达，所以仍然是垃圾。

这解释了为什么追踪式 GC 能处理循环引用：

```ts
let a: any = {};
let b: any = {};

a.other = b;
b.other = a;

a = null;
b = null;
```

对象之间互相引用不代表它们永远存活。关键仍然是：外部是否还有一条从 Root 通向它们的路径。

### 清扫：重新利用垃圾内存

标记结束后，引擎扫描堆：

```text
有标记：保留
无标记：回收
```

这类基础算法称为 Mark-Sweep，标记清扫。被回收的区域会进入空闲列表，供之后创建新对象时重新使用。

但只清扫会产生碎片：

```text
[使用][空闲][使用][空闲][使用][空闲]
```

总空闲空间可能很多，却没有足够大的连续区域。

### 整理：把活对象排紧

Mark-Compact，标记整理，会移动仍然存活的对象：

```text
整理前：[A][空][B][空][空][C]
整理后：[A][B][C][    空闲    ]
```

对象被移动后，引擎还要更新所有指向它们的引用。

另一种常见方式是复制：

```text
旧区域：[A][垃圾][B]
新区域：[A][B]
```

只复制活对象，然后整体清空旧区域。它很适合垃圾很多、活对象较少的内存区域。

## 4. 分代回收：大部分新对象死得很快

JavaScript 程序会频繁创建临时对象：

```ts
function updatePosition(x: number, y: number) {
  const position = { x, y };
  render(position);
}
```

很多对象只活一次调用。现代 GC 通常基于一个经验：

> 大部分新对象很快死亡；经过多轮回收还活着的对象，更可能继续存活。

因此堆通常会分成：

```text
年轻代
  新创建的对象
  空间较小，回收频繁

老年代
  存活较久或体积较大的对象
  空间较大，回收成本更高
```

年轻代常使用复制算法：

```text
新对象进入年轻代
  ↓
区域接近上限
  ↓
把活对象复制到另一块区域
  ↓
整体清空旧区域
  ↓
多次存活的对象晋升到老年代
```

年轻代回收常被称为 Minor GC；老年代回收常被称为 Major GC。具体名称和实现会因 V8、JavaScriptCore 等引擎而不同。

## 5. 写屏障：记录老对象对新对象的引用

只回收年轻代时，还要考虑老对象引用新对象：

```ts
globalManager.currentRequest = {
  id: 123,
};
```

引用关系是：

```text
老年代 globalManager
  ↓
年轻代 currentRequest
```

为了避免每次都扫描整个老年代，引擎会在写入引用时执行 Write Barrier，写屏障，记录“这个老对象可能引用了年轻对象”。

年轻代回收时，只需要额外检查这些记录，而不必遍历整个老年代。Card Table、Remembered Set 都是为这类关系服务的结构。

写屏障不是业务代码主动调用的 API，而是引擎在对象赋值等操作背后插入的维护逻辑。

## 6. GC 为什么仍然可能造成卡顿

最简单的 GC 需要先暂停 JavaScript：

```text
暂停 JS
  ↓
遍历引用图
  ↓
回收、移动对象
  ↓
恢复 JS
```

这叫 Stop The World。堆越大、存活对象越多，一次完整处理的成本通常越高。

现代引擎会尽量缩短停顿：

- 增量标记：把一次大标记拆成多个小步骤。
- 并发标记：GC 线程与 JS 主线程同时推进部分工作。
- 并行回收：多个 GC 线程一起处理。
- 分代回收：优先回收较小、垃圾更多的年轻代。
- 空闲调度：尽量在运行时较空闲的时候工作。

但“并发 GC”不等于完全没有暂停。某些阶段仍要短暂停下 JS，确认引用关系一致。

游戏中每帧制造大量临时数组、对象和闭包，常见问题不一定是永久泄漏，也可能是：

```text
对象分配太快
  ↓
年轻代频繁填满
  ↓
GC 频率升高
  ↓
某些帧出现停顿
```

所以内存优化有两个不同目标：

- 防止本应消失的对象长期存活。
- 减少热点路径中的无意义临时分配。

## 7. 闭包、事件和定时器为什么容易留住组件

闭包会保存自己真正使用到的外层变量：

```ts
function bindPanel(panel: Panel) {
  return () => {
    panel.refresh();
  };
}
```

引用关系是：

```text
回调函数
  ↓
闭包环境
  ↓
panel
```

如果事件系统继续保存这个回调：

```text
事件系统
  ↓
回调
  ↓
组件
  ↓
节点、数组、资源
```

整条引用链都可能继续可达。

Cocos 事件应按业务生命周期成对管理：

```ts
onEnable() {
  this.node.on("click", this.onClick, this);
}

onDisable() {
  this.node.off("click", this.onClick, this);
}
```

使用 `bind` 时尤其要注意：每次调用都会得到新函数，绑定和解绑必须保存并复用同一引用。更完整的说明见 [JavaScript 运行时](/rabbit-holes/javascript/01-js-runtime/#重点bind-生成新函数解绑必须使用同一引用)。

定时器也会保存回调：

```ts
private timer: ReturnType<typeof setInterval> | null = null;

onEnable() {
  this.timer = setInterval(() => {
    this.refresh();
  }, 1000);
}

onDisable() {
  if (this.timer !== null) {
    clearInterval(this.timer);
    this.timer = null;
  }
}
```

判断是否可能泄漏时，不要只看代码执行完没有，而要沿着引用链问：

```text
谁保存了回调？
  ↓
回调捕获了什么？
  ↓
这些对象又引用了什么？
```

## 8. 异步回调回来时，对象可能已经过期

下面的代码不一定泄漏，但可能产生生命周期错误：

```ts
private async loadPlayer() {
  const player = await loadPlayerData();
  this.render(player);
}
```

可能发生：

```text
开始请求
  ↓
页面关闭或组件销毁
  ↓
请求完成
  ↓
旧回调继续更新失效对象
```

GC 不能解决这个问题，因为异步流程仍然合法地持有后续回调。业务代码需要明确“结果是否还有效”：

```ts
private requestId = 0;

private async refresh() {
  const currentId = ++this.requestId;
  const data = await loadData();

  if (currentId !== this.requestId) {
    return;
  }

  this.render(data);
}
```

常见治理方式包括：

- 使用 `AbortController` 或取消令牌终止可取消任务。
- 使用请求序号丢弃旧结果。
- 在回调中检查页面、节点或组件是否仍然有效。
- 用状态机约束“加载中、已关闭、已销毁”等状态。

这里要区分：

```text
内存泄漏：对象长期不该活却仍然可达
过期回调：对象可能仍然活着，但业务上已经不该执行
```

两者经常同时出现，但不是同一个问题。

## 9. Cocos 生命周期：按“应该响应到什么时候”配对

事件并不是一律在 `onDestroy` 才解绑。应根据业务边界选择：

| 绑定时机 | 解绑时机 | 语义 |
|---|---|---|
| `onEnable` | `onDisable` | 组件启用期间响应 |
| `onLoad` | `onDestroy` | 组件整个存在期间响应 |
| 打开一次临时操作 | 操作结束 | 只在这次流程中响应 |

核心问题是：

> 这个组件从什么时候开始应该响应？从什么时候开始不应该响应？

生命周期正确不只意味着最终没有泄漏，还意味着不可见、禁用或已经过期的对象不会继续产生行为。

## 10. `try/finally` 管短流程，生命周期钩子管长对象

`finally` 适合保证一次操作的临时状态被恢复：

```ts
this.loading = true;

try {
  await this.submit();
} finally {
  this.loading = false;
}
```

但长期事件不能这样管理：

```ts
try {
  this.node.on("click", this.onClick, this);
} finally {
  this.node.off("click", this.onClick, this);
}
```

这里会在 `try` 结束时立刻解绑。

可以这样区分：

```text
try/finally
  管一次调用、请求、锁或临时状态

onEnable/onDisable、onLoad/onDestroy
  管组件在一段时间内持续存在的行为
```

另外，`try/catch` 只能捕获当前调用链里被抛出的异常。事件、定时器或未 `await` 的 Promise 已经跨过异步边界，原来的 `catch` 不再位于它们执行时的调用栈中。

## 11. JS 堆释放不等于 native 资源释放

在 Cocos native / JSB 环境里，还存在跨边界引用：

```text
JS 对象
  ↕
JSB / native bridge
  ↕
C++ / Objective-C / Java 对象
  ↓
纹理、音频、Spine、GPU 资源
```

JS 包装对象不可达，不代表 native 或 GPU 资源一定立刻释放；native 侧继续持有对象时，也可能延长相关对象的实际生命周期。

因此游戏中的“清理”可能同时包括：

- 解绑事件和停止定时器。
- 取消或失效异步任务。
- 从单例、缓存、数组和对象池中移除引用。
- 销毁节点或组件。
- 按资源系统的引用规则释放资源。
- 关闭 native 句柄或 SDK 回调。

GC 主要负责 JavaScript 堆，不负责理解所有外部资源的业务释放规则。

不要依赖 `FinalizationRegistry` 处理关键资源。GC 的触发时间不确定，终结回调也不适合作为及时、可靠的业务清理机制。

## 12. 排查内存问题：找 Retaining Path

发现某类对象数量持续增长时，最重要的问题不是“怎么强制 GC”，而是：

> 谁还在引用它？

典型排查路径：

```text
重复执行：打开页面 → 关闭页面
  ↓
观察对象数量是否持续增长
  ↓
获取 Heap Snapshot
  ↓
找到未释放的组件或对象
  ↓
查看 Retaining Path
  ↓
定位事件、定时器、闭包、单例或缓存引用
```

常见保留路径包括：

```text
window → manager → cache → panel
EventBus → callback → component
timer → closure → node
Promise reaction → async context → panel
```

需要同时观察两类问题：

- Heap 一直增长：可能存在长期引用。
- Heap 能回落但帧仍然抖动：可能是分配太频繁、GC 停顿或 native/GPU 内存问题。

## 逻辑闭环 / 锚点

JavaScript 内存管理的完整链路是：

```text
创建对象
  ↓
引擎在堆中分配内存
  ↓
变量、对象、闭包、事件、异步任务形成引用图
  ↓
业务结束并主动断开不再需要的引用
  ↓
对象从 GC Roots 不再可达
  ↓
GC 标记活对象
  ↓
清扫垃圾，必要时复制或整理存活对象
  ↓
空闲内存重新用于后续分配
```

最重要的三个判断是：

```text
这个对象为什么还活着？
谁在引用它？
它业务上是否还应该继续工作？
```

GC 只负责第一个问题的底层判定。事件解绑、任务取消、状态失效和 native 资源释放，仍然是业务和宿主生命周期的一部分。

## 关联

- [JavaScript 运行时](/rabbit-holes/javascript/01-js-runtime/)：GC、闭包、V8 / JSC 和 JSB 的运行时入口。
- [事件循环 vs 游戏帧循环](/rabbit-holes/javascript/02-event-loop-vs-game-loop/)：异步回调什么时候回来，与对象回来时是否仍然有效是两个问题。
- [数据库存储](/rabbit-holes/database/01-storage-pages-buffer-wal/)：都在区分逻辑状态与底层物理状态；“业务上删除”不等于存储或内存立刻消失。

---

*来源：与 Codex 的对话，2026-07。*
