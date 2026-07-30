---
title: "JavaScript 语言语义：`this`、闭包、相等与空值"
layout: page
comments: false
toc: true
permalink: /rabbit-holes/javascript/04-language-semantics/
---
[← 返回兔子洞总览](/rabbit-holes/) · [javascript 主题地图](/rabbit-holes/javascript/)

> JavaScript 最容易让人困惑的地方，往往不是语法怎么写，而是表达式按什么规则解释：普通函数的 `this` 看调用方式，闭包保存词法环境，对象相等比较引用身份，`null` 和 `undefined` 表达不同种类的“空”。

## 我追问的链

- `this` 到底指向谁，是函数定义时决定的吗？
- `bind` 和箭头函数都能固定 `this`，区别是什么？
- 方法从对象上取出来以后，为什么会丢失 `this`？
- 闭包看起来很像类，它存在的意义是什么？
- 闭包能做的类是不是都能做？闭包如何释放？
- `===` 和 `==` 最终比较的是什么？
- 对象内容完全一样，为什么仍然不相等？
- `null` 和 `undefined` 为什么要同时存在？

## 1. 普通函数的 `this` 由调用方式决定

先看同一个函数：

```ts
function showName() {
  console.log(this.name);
}
```

只看函数定义，无法确定 `this`。必须看它怎么被调用。

### 作为对象方法调用

```ts
const player = {
  name: "Alice",
  showName,
};

player.showName();
```

调用点是：

```text
player.showName()
^^^^^^
```

所以这次调用中的 `this` 是 `player`。

容易产生误解的说法是“函数属于 player”。更准确地说：

> 这次调用通过 `player.showName()` 发起，所以普通函数的 `this` 被设为 `player`。

### 脱离对象后调用

```ts
const callback = player.showName;
callback();
```

虽然 `callback` 和 `player.showName` 指向同一个函数，但调用形式已经变成：

```text
callback()
```

它前面没有对象，因此不再自动得到 `player`。

在严格模式和 ES Module 中，这种普通函数调用的 `this` 通常是 `undefined`。旧式非严格脚本中，它可能退回全局对象，但不应该依赖这种行为。

这就是常说的“方法被取出来后丢失 `this`”。

## 2. 四种常见绑定规则

普通函数的 `this` 可以先按四类理解。

### 默认绑定

```ts
function run() {
  console.log(this);
}

run();
```

严格模式下通常是 `undefined`。

### 隐式绑定

```ts
const controller = {
  run,
};

controller.run();
```

`this` 是调用点左边的 `controller`。

### 显式绑定

```ts
run.call(controller);
run.apply(controller);

const boundRun = run.bind(controller);
boundRun();
```

调用者主动指定 `this`。

### 构造调用

```ts
function Player(name: string) {
  this.name = name;
}

const player = new Player("Alice");
```

`new` 会创建一个新对象，并让构造函数中的 `this` 指向它。

可以用这条简化优先级记忆：

```text
new 调用
  >
call / apply / bind 显式绑定
  >
obj.fn() 隐式绑定
  >
普通 fn() 默认绑定
```

其中 `new` 调用一个 bound function 时，会忽略 `bind` 传入的 `thisArg`，因为构造过程需要使用新创建的实例；预先绑定的参数仍然有效。

## 3. `call`、`apply`、`bind` 的区别

三者都可以指定普通函数的 `this`：

```ts
function attack(target: string, damage: number) {
  console.log(this.name, target, damage);
}
```

`call` 立即调用，参数逐个传：

```ts
attack.call(player, "boss", 10);
```

`apply` 立即调用，参数以数组传：

```ts
attack.apply(player, ["boss", 10]);
```

`bind` 不立即调用，而是创建一个新函数：

```ts
const playerAttack = attack.bind(player, "boss");
playerAttack(10);
```

核心区别：

| API | 是否立即调用 | 参数形式 | 返回值 |
|---|---:|---|---|
| `call` | 是 | 逐个参数 | 原函数执行结果 |
| `apply` | 是 | 数组或类数组 | 原函数执行结果 |
| `bind` | 否 | 可预置部分参数 | 新函数 |

每次 `bind` 都会创建不同的函数对象：

```ts
attack.bind(player) !== attack.bind(player); // true
```

所以事件绑定和解绑必须复用同一个函数引用。Cocos 中更适合直接使用 `target` 参数：

```ts
onEnable() {
  this.node.on("click", this.onClick, this);
}

onDisable() {
  this.node.off("click", this.onClick, this);
}
```

## 4. 箭头函数没有自己的 `this`

箭头函数不会根据调用方式重新计算 `this`。它使用定义位置外层作用域中的 `this`：

```ts
class Panel {
  name = "player-panel";

  delayPrint() {
    setTimeout(() => {
      console.log(this.name);
    }, 100);
  }
}
```

箭头函数定义在 `delayPrint` 内部，因此捕获这次 `delayPrint` 调用中的 `this`。

换成普通函数：

```ts
setTimeout(function () {
  console.log(this.name);
}, 100);
```

定时器之后只是调用这个普通函数，不会替你保留 `Panel` 实例。

箭头函数的关键不是“自动指向当前类”，而是：

> 它不创建自己的 `this`，而是沿词法作用域向外寻找。

因此 `call`、`apply`、`bind` 无法改变箭头函数的 `this`：

```ts
const arrow = () => console.log(this);
arrow.call(other); // this 仍来自定义位置
```

箭头函数也不能作为构造函数：

```ts
const Player = () => {};
new Player(); // TypeError
```

## 5. 类方法和箭头函数属性

类里常见两种写法：

```ts
class Panel {
  onClick() {
    console.log(this);
  }

  onClose = () => {
    console.log(this);
  };
}
```

普通方法通常放在原型上，由实例共享：

```text
Panel.prototype.onClick
```

箭头函数属性通常在每个实例创建时生成一个新函数：

```text
panelA.onClose !== panelB.onClose
```

它不容易丢失 `this`，但每个实例都会保存自己的函数对象。

工程上可以这样选择：

- 需要原型共享、调用关系清楚：普通方法。
- 回调会被外部直接保存，且确实需要捕获实例：箭头函数属性。
- Cocos 事件支持 `target`：优先普通方法加第三个 `target`。

## 6. 闭包不是“函数套函数”

闭包更准确的定义是：

> 函数与它能够访问的词法环境组合在一起。

例如：

```ts
function createCounter() {
  let count = 0;

  return function next() {
    count += 1;
    return count;
  };
}

const counter = createCounter();
```

`createCounter()` 已经执行结束，但返回的 `next` 仍然引用 `count`：

```text
counter
  ↓
next 函数
  ↓
词法环境
  ↓
count
```

所以 `count` 继续存在。

闭包的价值不是单纯“保存变量”，而是让函数携带自己的上下文：

- 创建私有状态。
- 生成带配置的函数。
- 实现回调和高阶函数。
- 保存一次流程的局部上下文。
- 避免把所有状态都挂到全局或公开对象上。

## 7. 闭包与类：能力重叠，表达方式不同

闭包计数器：

```ts
function createCounter() {
  let count = 0;

  return {
    next() {
      count += 1;
      return count;
    },
  };
}
```

类计数器：

```ts
class Counter {
  private count = 0;

  next() {
    this.count += 1;
    return this.count;
  }
}
```

两者都能表达“状态 + 操作”，但组织方式不同：

| 维度 | 闭包 | 类 |
|---|---|---|
| 状态位置 | 词法环境 | 实例属性 |
| 私有性 | 天然无法从外部直接访问 | `private` 或 `#field` |
| 方法共享 | 每次工厂调用通常创建函数 | 原型方法可被实例共享 |
| 继承与类型 | 不擅长表达继承体系 | 更适合对象模型和类型关系 |
| 局部流程状态 | 很自然 | 可能显得偏重 |
| 调试观察 | 捕获环境有时较隐蔽 | 实例字段通常更直观 |

闭包能做的事情，很多都能用类重新表达；类能做的事情，也经常能用对象和闭包组合出来。

闭包没有“任何场景都胜过类”的绝对优势。它的优势是：

> 当状态本来就属于某次函数调用或某段局部流程时，闭包能用很少的结构把状态和行为绑在一起。

类的优势是：

> 当状态属于一个长期存在、需要多个方法协作、需要类型关系的实体时，类通常更清晰。

## 8. 闭包如何释放

闭包不需要特殊的“释放函数”。只要外部不再引用闭包函数，它和捕获环境就可能变得不可达：

```ts
let counter: (() => number) | null = createCounter();

counter();
counter = null;
```

但如果闭包被其他系统保存：

```ts
eventBus.on("update", counter);
```

只执行 `counter = null` 不够，因为事件系统还持有它。必须先解除保存关系：

```ts
eventBus.off("update", counter);
counter = null;
```

所以释放闭包的真实问题是：

```text
谁还保存着这个函数？
  ↓
函数又捕获了哪些对象？
```

更完整的引用链与 GC 说明见 [内存与生命周期](/rabbit-holes/javascript/03-memory-lifecycle/)。

## 9. `===`：不做类型转换

`===` 对应严格相等语义。它先比较类型，再比较值。

不同类型通常直接不相等：

```ts
1 === "1";        // false
false === 0;      // false
null === undefined; // false
```

同类型时：

- 数字比较数值，但 `NaN` 与任何值都不相等，包括自己。
- 字符串比较字符序列。
- 布尔值比较 `true` 或 `false`。
- `null` 只严格等于 `null`。
- `undefined` 只严格等于 `undefined`。
- 对象比较引用身份。

```ts
const a = { value: 1 };
const b = { value: 1 };
const c = a;

a === b; // false
a === c; // true
```

`===` 不会递归比较对象内容。它问的是：

> 两边是不是同一个对象？

## 10. `==`：按规范进行类型转换

`==` 对应抽象相等语义。类型不同时，它会按规则尝试转换：

```ts
1 == "1";       // true
0 == false;     // true
"" == false;    // true
null == undefined; // true
```

它不是简单地“全部转成字符串”或“全部转成数字”。不同类型组合走不同规则。

常见过程包括：

```text
对象
  ↓ ToPrimitive
原始值
  ↓ 按两侧类型决定 ToNumber 等转换
继续比较
```

例如：

```ts
[1] == 1;
```

可以粗略理解为：

```text
[1]
  ↓ ToPrimitive
"1"
  ↓ ToNumber
1
  ↓
1 == 1
```

复杂转换容易产生反直觉结果，所以业务代码通常优先使用 `===`。需要接收多种输入类型时，应主动、明确地转换：

```ts
Number(input) === expected;
String(input) === expected;
```

## 11. `Object.is` 和 `SameValueZero`

`===` 有两个特殊数字行为：

```ts
NaN === NaN; // false
0 === -0;    // true
```

`Object.is` 使用 SameValue 语义：

```ts
Object.is(NaN, NaN); // true
Object.is(0, -0);    // false
```

`Map`、`Set`、`Array.prototype.includes` 等常使用 SameValueZero：

```ts
new Set([NaN]).has(NaN); // true
[NaN].includes(NaN);     // true
```

SameValueZero 和 `===` 接近，但认为 `NaN` 与自身相等，同时不区分 `0` 和 `-0`。

因此 JavaScript 里不只有一种“相等”：

| 操作 | 类型转换 | `NaN` 等于自身 | 区分 `0/-0` |
|---|---:|---:|---:|
| `==` | 是 | 否 | 否 |
| `===` | 否 | 否 | 否 |
| `Object.is` | 否 | 是 | 是 |
| SameValueZero | 否 | 是 | 否 |

## 12. `undefined`：缺失或尚未提供

`undefined` 常见于：

- 变量声明后尚未赋值。
- 对象不存在某个属性。
- 函数没有显式返回值。
- 实参没有传入。
- 数组越界访问。

```ts
let value;
console.log(value); // undefined

const user = {};
console.log(user.name); // undefined

function run() {}
console.log(run()); // undefined
```

它更接近：

> 这个位置没有得到一个值。

## 13. `null`：明确表示这里没有对象

`null` 通常由程序主动写入：

```ts
let currentPlayer: Player | null = null;
```

它更接近：

> 这个位置是有定义的，但当前明确为空。

所以工程上常这样区分：

```text
undefined：缺失、未提供、尚未赋值
null：调用者或业务明确设置为空
```

JavaScript 有一条历史兼容规则：

```ts
null == undefined;  // true
null === undefined; // false
```

但它们都不宽松等于这些值：

```ts
null == 0;     // false
null == false; // false
null == "";    // false
```

`typeof null` 返回 `"object"` 是 JavaScript 早期留下的历史问题，不代表 `null` 真的是普通对象：

```ts
typeof null; // "object"
```

## 14. `||`、`??` 和 `?.`

`||` 按真假值选择：

```ts
const count = input || 10;
```

如果 `input` 是 `0`、`""`、`false`，也会使用默认值。

`??` 只把 `null` 和 `undefined` 当作缺失：

```ts
const count = input ?? 10;
```

因此：

```ts
0 || 10;  // 10
0 ?? 10;  // 0
```

可选链 `?.` 在左侧为 `null` 或 `undefined` 时停止访问：

```ts
const city = user.address?.city;
```

它不会吞掉所有错误。如果 `address` 存在，但 getter 或后续代码主动抛错，异常仍然会继续传播。

## 逻辑闭环 / 锚点

把这一篇压缩成四条规则：

```text
普通函数的 this
  → 看调用方式

箭头函数的 this
  → 看定义位置的外层作用域

闭包的状态
  → 活在被函数引用的词法环境中

相等与空值
  → 先确认比较算法和“空”的业务语义
```

最实用的工程习惯是：

- 回调前先判断普通函数是否会丢失 `this`。
- 事件解绑始终保留同一函数引用。
- 用类表达长期实体，用闭包表达局部流程状态。
- 默认使用 `===`，需要转换时显式转换。
- 用 `undefined` 表达缺失，用 `null` 表达明确为空。
- 需要保留 `0`、`false`、空字符串时，使用 `??` 而不是 `||`。

## 关联

- [JavaScript 运行时](/rabbit-holes/javascript/01-js-runtime/)：语言语义由 ECMAScript 定义，引擎负责实现。
- [内存与生命周期](/rabbit-holes/javascript/03-memory-lifecycle/)：闭包和事件回调如何形成真实引用链。
- 下一篇 [Promise 与错误流](/rabbit-holes/javascript/05-promise-error-flow/)：函数调用跨过异步边界后，返回值和异常如何继续传播。

---

*来源：与 Codex 的对话，2026-07。*
