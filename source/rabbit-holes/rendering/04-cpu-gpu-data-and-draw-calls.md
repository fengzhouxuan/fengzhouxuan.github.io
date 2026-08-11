---
title: "CPU 怎样组织数据并命令 GPU 绘制"
layout: page
comments: false
toc: true
permalink: /rabbit-holes/rendering/04-cpu-gpu-data-and-draw-calls/
---
[← 返回兔子洞总览](/rabbit-holes/) · [rendering 主题地图](/rabbit-holes/rendering/)

> CPU 负责组织场景、资源和绘制命令，GPU 负责让同一套 Shader 在大量顶点与片元上并行执行。理解 Draw Call 的关键，不是背 API，而是看清不同数据以什么频率变化。

## 我追问的链

- 场景里只有 Node、GameObject 和组件，GPU 为什么会知道该画什么？
- Mesh 为什么不只是一些空间位置？
- 一个立方体只有 8 个角，为什么渲染时常有 24 个顶点？
- 索引缓冲解决了什么问题？
- 一次 Draw Call 到底提交了什么？
- 为什么很少的三角形也可能产生性能问题？
- 静态合批、动态合批和 GPU Instancing 分别在复用什么？
- 为什么两个对象使用同一个材质仍可能无法合批？
- Attribute 和 Uniform 的定义是什么？为什么必须区分它们？

## 1. CPU 与 GPU 为什么要分工

CPU 擅长处理控制流和复杂业务：

```text
游戏逻辑
节点层级
动画状态
可见性判断
资源管理
绘制顺序
```

GPU 擅长让同一段程序同时处理大量结构相似的数据：

```text
大量顶点
大量三角形
大量片元
大量纹理采样
```

因此一帧可以先近似理解为：

```text
CPU 更新游戏逻辑和 Transform
  ↓
CPU 找出相机可见的物体
  ↓
CPU 准备 Mesh、材质、纹理、矩阵与渲染状态
  ↓
CPU 通过图形 API 记录并提交绘制命令
  ↓
GPU 执行顶点处理、图元装配、光栅化和片元处理
```

CPU 不会逐像素告诉 GPU 应该是什么颜色。它提交数据和规则，让 GPU 批量计算。

## 2. Mesh 提供的不是“物体”，而是可绘制数据

对 GPU 来说，Mesh 不是“角色”或“石头”，而是：

```text
顶点属性数据
+
描述怎样组成图元的索引
```

一个渲染顶点通常不只有位置，还可能携带：

```text
position  位置
normal    法线
uv        纹理坐标
color     顶点颜色
tangent   切线
weights   骨骼权重
joints    骨骼编号
```

所以“空间中的一个点”和“一个渲染顶点”不是同一个概念。

### 为什么立方体经常有 24 个顶点

立方体从几何上只有 8 个角，但同一个角同时属于三个面。

以右上前方的角为例：

```text
在上表面：法线朝上
在右表面：法线朝右
在前表面：法线朝前
```

一个渲染顶点只能保存一套属性。位置虽然相同，法线却不同，因此这个角必须拆成三份顶点记录。

硬边立方体通常是：

```text
6 个面 × 每面 4 个顶点 = 24 个渲染顶点
```

同理，UV 接缝、硬边法线和不同顶点色，也会让同一个空间位置拆成多个渲染顶点。

> 只有位置和全部顶点属性都相同的数据，才是真正可以共享的同一个渲染顶点。

## 3. 为什么还需要索引

GPU 通常以三角形作为基本图元。一个矩形面会拆成两个三角形：

```text
0 ─── 1
│   ／ │
│ ／   │
2 ─── 3
```

顶点表只保存 4 份数据，索引表描述两个三角形：

```text
0, 2, 1,
1, 2, 3
```

数字不是坐标，而是“去顶点表中读取第几个顶点”。索引让相邻三角形复用相同的顶点记录，减少数据量，也有利于复用顶点 Shader 的计算结果。

## 4. 一次 Draw Call 是什么

一次 Draw Call 可以理解为 CPU 对 GPU 说：

> 使用当前绑定的数据、程序和状态，绘制这一批图元。

| 类别 | 例子 | 回答的问题 |
|---|---|---|
| 几何数据 | 顶点缓冲、索引缓冲 | 画什么形状 |
| Shader / 材质 | 顶点与片元程序 | 怎样计算位置和颜色 |
| 资源与参数 | 矩阵、颜色、贴图、光照 | 计算时使用什么数据 |
| 渲染状态 | 深度、混合、剔除、渲染目标 | 怎样参与当前画面 |

一个 Sprite 可以近似为：

```text
Mesh      = 四个顶点、两个三角形
Texture   = 精灵图片
Material  = 采样纹理并处理透明度的 Shader 与参数
Matrix    = Sprite 的位置、旋转和缩放
State     = 透明混合等状态
Draw Call = 使用以上内容执行绘制
```

Draw Call 不等于“一个 Node”或“一个 GameObject”：一个对象可能产生多次 Draw Call，多个对象也可能被合进一次或少数几次 Draw Call。

## 5. 为什么状态变化会带来成本

CPU 与驱动准备下一批绘制通常需要：

```text
绑定 Shader
绑定纹理和 Buffer
更新材质参数
设置深度、混合与剔除状态
记录绘制命令
```

100 个 UI 图片都是矩形，但结果可能完全不同：

```text
同图集、同材质、连续绘制
→ 可能合成很少的 Draw Call

每张图使用独立纹理
→ 可能接近 100 次 Draw Call
```

差别不在那 200 个三角形，而在绘制序列被切成了多少批。

## 6. 合批究竟在合什么

> 在不改变最终画面的前提下，让更多图元共享一次状态设置和绘制提交。

| 方法 | 核心做法 | 典型场景 |
|---|---|---|
| 静态合批 | 预先把多个不动的网格合成大网格 | 建筑、地面、静态装饰 |
| 动态合批 | 每帧临时整理兼容的小网格 | UI、Sprite、简单粒子 |
| GPU Instancing | 复用同一份 Mesh，只提供每个实例的数据 | 草、树、相同模型、弹丸 |

```text
静态合批       → 合并几何
动态合批       → 临时拼几何
GPU Instancing → 复用几何，只更换实例参数
```

### 为什么同一材质仍不一定能合批

绘制还可能因为以下差异断批：

```text
纹理不同
材质参数不同
混合、深度、剔除或 Stencil 状态不同
渲染队列不同
透明物体的顺序不能交换
```

例如顺序为 `材质 X → 材质 Y → 材质 X`，即使第一和第三个对象兼容，也可能因为透明顺序不能改变而形成三批。

## 7. Shader 为什么需要不同种类的输入

顶点 Shader 会对不同顶点反复执行同一份程序：

```text
输出位置 = MVP 矩阵 × 顶点位置
```

但两个输入的变化规律不同：

```text
顶点位置 → 每次执行不同
MVP 矩阵 → 当前这一批共同使用
```

GPU 必须知道哪些数据要根据顶点编号自动换下一份，哪些数据在当前 Draw Call 中保持相同。这就是 Attribute 与 Uniform 出现的原因。

## 8. Attribute 的定义、意义与来源

Attribute 是：

> 与单个顶点关联的数据。GPU 每执行一次顶点 Shader，会根据当前顶点编号和顶点布局，从顶点缓冲区中取出对应的一份。

旧版 GLSL / WebGL 1 常写成：

```glsl
attribute vec3 a_position;
attribute vec2 a_uv;
```

现代 GLSL 通常写成：

```glsl
in vec3 a_position;
in vec2 a_uv;
```

Attribute 让同一份顶点 Shader 程序，可以高效接收大量顶点各自不同的数据。

## 9. Uniform 的定义、意义与边界

Uniform 是：

> 由 CPU 在绘制前提供，并在同一次 Draw Call 的所有相关 Shader 执行实例中共同可见的一组参数。

```glsl
uniform mat4 u_mvp;
uniform vec4 u_tintColor;
```

CPU 可以近似执行：

```text
设置 u_mvp = 当前物体的 MVP
设置 u_tintColor = 红色
提交 Draw Call
```

当前 Draw Call 的每个顶点读取同一个 `u_mvp`；产生的每个片元也读取同一个 `u_tintColor`。

“共同使用”不表示结果相同：

```text
同一个矩阵 × 不同顶点位置 = 不同输出位置
```

它也不表示 Uniform 整帧都不变。CPU 可以在下一次 Draw Call 前修改它：

```text
设置矩阵 A → Draw A
设置矩阵 B → Draw B
```

### 为什么需要区分二者

如果 100 万个顶点都重复携带同一个 64 字节 `mat4`，会浪费大约 64 MB。作为 Uniform，当前绘制只需要一份。

反过来，如果顶点位置是普通 Uniform，同一 Draw Call 的所有顶点都会得到相同位置，三角形会缩成一个点。

| 概念 | 数据与谁关联 | GPU 如何取得 |
|---|---|---|
| Attribute | 一个顶点 | 按顶点编号从 Buffer 读取 |
| Uniform | 一次 Draw Call | 从当前绘制的参数区读取 |

## 10. Varying：顶点数据怎样来到片元

片元 Shader 通常不会直接读取原始 Attribute：

```text
顶点 Attribute
  ↓
顶点 Shader 输出
  ↓
光栅化阶段在三角形内部插值
  ↓
片元 Shader 输入
```

旧版 GLSL 称为 `varying`；现代 GLSL 使用顶点 Shader 的 `out` 与片元 Shader 的 `in`。

## 11. 用变化频率理解数据位置

```text
每个顶点不同？
→ Attribute

同一次 Draw Call 共同使用？
→ Uniform

从顶点输出并在三角形内部插值？
→ Varying / 顶点输出与片元输入

同一次实例化绘制中，每个对象不同？
→ Instance 数据

Shader 需要按坐标查询大量数据？
→ Texture / Buffer 等资源
```

> Attribute 描述“当前顶点带来了什么”；Uniform 描述“这一批计算处于什么共同环境”。

## 阶段锚点

```text
场景对象
  ↓ CPU 提取
Mesh、材质、纹理、矩阵、渲染状态
  ↓
Attribute：每顶点数据
Uniform：每 Draw Call 共同参数
  ↓
Draw Call：使用当前绑定内容绘制一批图元
  ↓
GPU 并行执行 Shader
```

下一步继续追问：

> 为什么这些数据必须先放进 Buffer？GPU 为什么不能直接读取 JavaScript 或 C# 对象？图形 API 又怎样把一次 Draw Call 记录进命令缓冲并提交给 GPU？

## 关联

- 承接 [坐标系与矩阵变换](/rabbit-holes/rendering/03-coordinate-spaces-and-matrices/)：上一课得到的 Model、View、Projection 矩阵，在这里成为绘制参数。
- 回看 [顶点、三角形与插值](/rabbit-holes/rendering/02-vertices-triangles-interpolation/)：顶点属性在这里进一步落到 Attribute，插值数据则对应 Varying。

---

*来源：与 Codex 的对话，2026-08。本章进行中。*
