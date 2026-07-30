# 打个大柚子的兔子洞

基于 Hexo 和 FlatPaper 的个人知识站点源码。

## 本地开发

```bash
npm ci
npm run server
```

默认访问 `http://localhost:4000`。

## 构建检查

```bash
npm run check
```

生成结果位于 `public/`，该目录不提交到 Git。推送到 `main` 后，由 GitHub Actions 构建并发布到 GitHub Pages。

## 内容目录

- `source/_posts/`：普通文章。
- `source/rabbit-holes/`：按主题组织的兔子洞文档。
- `source/projects/`：项目工坊页面与可在线运行的静态项目。
- `source/about/`：关于页面。
- `source/friend/`：友情链接页面。
- `source/images/`：站点横幅、图标等公共图片。
- `source/_data/`：头像、封面列表等站点数据。
- `themes/flatpaper/`：当前使用的 FlatPaper 主题源码。

## 历史内容

旧 Jekyll 站点保留在独立的 legacy 分支中；已整理的静态项目会按需迁入新站。
