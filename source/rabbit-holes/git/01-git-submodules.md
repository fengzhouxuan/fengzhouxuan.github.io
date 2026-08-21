---
title: "Git 子模块：两个仓库怎样把依赖固定成可复现版本"
layout: page
comments: false
toc: true
permalink: /rabbit-holes/git/01-git-submodules/
---
[← 返回兔子洞总览](/rabbit-holes/) · [git 主题地图](/rabbit-holes/git/)

> 子模块不是把另一个仓库的文件复制进来，而是让父项目记住“它在哪里，以及这次必须取它的哪个 commit”。分支可以帮助选择下一次升级目标，但一次父项目提交最终仍固定一个精确版本。

## 我追问的链

- 框架为什么要单独一个仓库，直接复制进游戏项目不行吗？
- 父项目里明明看到 `assets/Framework`，它的代码到底归谁提交？
- 为什么切到一个子模块 commit 后会看到 `detached HEAD`？
- tag、commit、分支各在表达什么；父项目能不能“跟踪 tag”？
- “持续跟踪分支最新提交”是不是就不再固定版本？
- Cocos 框架开发需要 Creator 和测试场景，又不想把这些环境塞进框架仓库，应该怎样组织？

## 1. 先从一条命令看子模块到底加了什么

在父项目根目录执行：

```bash
git submodule add git@git.example.com:components/framework.git assets/Framework
```

这件事看似把 `framework` 放进了 `assets/Framework`，实际新增了两类记录：

```text
父项目
├─ .gitmodules
│  └─ assets/Framework 的 URL 与路径
└─ Git 索引中的 gitlink
   └─ assets/Framework = 1a2b3c4...（framework 的一个 commit）
```

`.gitmodules` 解决的是“到哪里取”：

```ini
[submodule "assets/Framework"]
    path = assets/Framework
    url = git@git.example.com:components/framework.git
```

而父项目的 gitlink 解决的是“这次究竟取哪个版本”。它的文件模式是 `160000`，可以这样观察：

```bash
git ls-tree HEAD assets/Framework
# 160000 commit 1a2b3c4...  assets/Framework
```

所以父项目不会逐个保存框架文件；框架仓库仍拥有自己的提交历史、分支和远端。

## 2. 默认模式：父项目固定子模块 commit

假设框架有两个提交：

```text
framework/main
  1a2b3c4 ── 5d6e7f8
```

父项目的一次提交可以只记录：

```text
game commit A
└─ assets/Framework = 1a2b3c4
```

即使框架 `main` 已经推进到 `5d6e7f8`，检出 `game commit A` 时也仍应得到 `1a2b3c4`。这就是可复现：同一份游戏代码总是配同一份框架代码。

初始化或恢复到父项目规定的版本：

```bash
git submodule update --init --recursive
```

默认会把子模块检出到父项目记录的 commit，因此常见 `detached HEAD`。这不是坏状态；它说明当前目的只是“使用这个精确版本”，而不是在框架上继续开发。

## 3. 固定 commit 与固定 tag，实际操作相同

commit 是对象身份；tag 是人类可读的发布名字。父项目最终只能记录 commit，不能记录“跟踪某个 tag”。

例如要把框架升级到发布 tag `v1.3.0`：

```bash
# 父项目根目录
git -C assets/Framework fetch --tags
git -C assets/Framework switch --detach v1.3.0

git add assets/Framework
git commit -m "chore: 固定 framework 至 v1.3.0"
```

逻辑是：

```text
v1.3.0 ──指向──> 5d6e7f8
父项目提交 ──记录──> assets/Framework = 5d6e7f8
```

因此 tag 被移动甚至删除，也不会改变已经提交的父项目 gitlink；但子模块远端仍必须保留该 commit，协作者才能取到它。发布实践中应把版本 tag 视为不可改名的承诺，不要重打同名 tag。

## 4. “跟踪分支”不是自动漂移

子模块可以在 `.gitmodules` 中声明：**当我主动更新时，请从框架的哪个分支寻找最新 commit。**

```bash
# 只需配置一次
git submodule set-branch --branch develop assets/Framework
git add .gitmodules
git commit -m "chore: 配置 framework 跟踪 develop"
```

它写出的配置类似：

```ini
[submodule "assets/Framework"]
    branch = develop
```

以后主动升级时：

```bash
git submodule update --remote --init assets/Framework
git add assets/Framework
git commit -m "chore: 升级 framework develop 最新版本"
```

`--remote` 会先获取 `origin/develop` 的当前最新 commit，再把子模块切过去。关键是第二步：**父项目仍要提交新的 gitlink**。

```text
升级前：assets/Framework = 1a2b3c4
执行 update --remote，develop 当前为 5d6e7f8
升级后：assets/Framework = 5d6e7f8
提交父项目后，5d6e7f8 才成为团队共享的固定版本
```

所以“持续跟踪”指持续使用分支作为**升级来源**，不表示已发布的父项目会自动变动。生产项目通常固定 tag/commit；框架的 `framework-lab` 可以跟踪 `develop`，用来尽早发现兼容问题。

## 5. 修改框架时：先子模块，后父项目

如果要在框架上开发，先离开 detached HEAD，创建真实分支：

```bash
cd assets/Framework
git switch -c feat/ui-stack

# 修改、测试
git add Script Component
git commit -m "feat: 增加 UI 栈能力"
git push -u origin feat/ui-stack
```

确认框架提交已经推到所有协作者和 CI 都能访问的远端后，再回到父项目决定是否升级指针：

```bash
cd ../..
git add assets/Framework
git commit -m "chore: 升级 framework"
git push
```

顺序不能反过来。若父项目先引用了尚未推送的框架 commit，其他人拉到父项目时会找不到该对象。

排查时也要看两层状态：

```bash
git status
git -C assets/Framework status
```

父项目显示子模块“modified”时，可能是指针已变，也可能是框架内部有未提交文件；后者不能靠只提交父项目解决。

## 6. Cocos 框架：框架与测试宿主分开

Cocos 框架可以依赖 `cc` API，但不应依赖某一个游戏的 `GameManager`、全局单例、业务 Prefab、场景节点或资源 UUID。它独立于**业务项目**，不独立于 Cocos Creator。

推荐用一个独立的测试宿主验证它：

```text
cocos-framework（框架仓库）
├─ Script/
├─ Component/
├─ Prefab/                 # 仅运行时真正需要的资源
├─ 所有内部资源对应的 .meta
└─ README.md

framework-lab（独立 Cocos 工程）
├─ assets/
│  ├─ Framework/           # 子模块：cocos-framework
│  └─ TestCases/           # 测试场景、模拟资源、验证脚本
├─ project.json
└─ 共享的工程设置与测试配置
```

这样打开的是 `framework-lab`，Creator 的场景、测试资源和本地生成目录都属于 lab，而不是框架。未来游戏项目也以同样路径挂载：

```text
game-a/assets/Framework  -> cocos-framework 的稳定 tag/commit
game-b/assets/Framework  -> cocos-framework 的稳定 tag/commit
```

框架仓库应提交运行时脚本、必要 Prefab/资源及其 `.meta`；不提交 Creator 安装包、引擎目录、`library/`、`temp/`、`build/`、`local/`、本机密钥或缓存。`assets/Framework.meta` 位于子模块目录外，属于每个父项目自己的 AssetDB 记录，应由 `framework-lab` 和各游戏项目分别管理。

框架要访问宿主能力时，使用初始化参数、接口或适配器注入，例如网络、登录态、埋点和弹窗承载节点；不要反向 import 某个游戏的业务层。

## 7. 协作时几个高频坑

| 现象 | 原因 | 处理 |
|---|---|---|
| clone 后 `assets/Framework` 为空 | 只拉了父项目 | `git submodule update --init --recursive` |
| 切父项目分支后子模块显示 modified | 两个父分支记录的 gitlink 不同 | `git submodule update --init --recursive`；切分支时可使用 `git switch --recurse-submodules` |
| 改了框架但父项目没有 diff | 修改仍在子模块内部，或子模块回到了原 commit | 分别检查两层 `git status` |
| CI 拉不到 framework | CI 未递归初始化，或无私有仓库读取权限 | 配置递归 checkout 与部署凭据 |
| Creator 切版本后 Prefab / 脚本异常 | `.meta` 漏提交、框架引用了宿主 UUID，或编辑器缓存未刷新 | 补齐 `.meta`，去掉宿主耦合，刷新 AssetDB 后做实际交互验证 |

切换包含 Prefab、Scene、资源的子模块 commit 前，先处理 Creator 未保存内容；切换后刷新并检查关键资源绑定和实际运行。不要用 `git add .` 顺手把业务项目或 Creator 自动生成的无关改动一起提交。

## 逻辑闭环 / 锚点

子模块把“依赖在哪里”和“依赖是哪一版”拆成了两件事：

```text
.gitmodules：路径 + URL，告诉 Git 到哪里找
gitlink：精确 commit，告诉 Git 这次必须拿哪一版
branch：主动升级时从哪里挑候选版本
tag：给某个 commit 的稳定发布名字
```

名字会移动，分支会继续长；只有 commit 是不可歧义的对象身份。父项目始终把最终选择落成一个 commit，于是依赖既能独立演进，也能让每次构建回到同一组源码。

## 关联与资料

- [Git 官方 `git-submodule` 文档](https://git-scm.com/docs/git-submodule)：`add`、`update`、`set-branch` 与 `--remote` 的精确定义。
- [Git Book：Submodules](https://git-scm.com/book/en/v2/Git-Tools-Submodules)：子模块克隆、初始化、切分支和 URL 同步的协作场景。
- [工程化](/rabbit-holes/engineering/01-what-is-engineering/)：依赖版本固定、自动检查和可回滚，都是把一次成功变成可重复交付的机制。
- [分层 + 封装](/rabbit-holes/patterns/)：父项目和子模块是两个独立层级，各自管理不同职责。

---

*来源：Git 官方文档、与 Codex 的对话，2026-08。*
