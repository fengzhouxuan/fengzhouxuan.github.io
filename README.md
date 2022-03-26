![logo](https://images.gitee.com/uploads/images/2019/0806/102334_da2e0dde_1593966.jpeg "logo2.jpg")
[![codebeat badge](https://codebeat.co/badges/5f031df3-f6c1-4ec0-911a-ff6617ca50b9)](https://codebeat.co/projects/github-com-ckjcode-ckjcode.gitee.io-master)
[![GitHub issues](https://img.shields.io/github/issues/ckjcode/ckjcode.gitee.io.svg?style=flat)](https://gitee.com/ckjcode/ckjcode/issues)
[![License MIT](https://img.shields.io/badge/license-MIT-blue.svg?style=flat)](https://github.com/home-assistant/home-assistant-iOS/blob/master/LICENSE)
[![](https://img.shields.io/github/stars/ckjcode/ckjcode.gitee.io.svg?style=social&label=Star)](https://gitee.com/ckjcode/ckjcode)
[![](https://img.shields.io/github/forks/ckjcode/ckjcode.gitee.io.svg?style=social&label=Fork)](https://gitee.com/ckjcode/ckjcode)


>
### [查看博客戳这里 👆](https://ckjcode.gitee.io)



## 使用

* 开始
	* [环境](#环境)
	* [开始](#开始)
	* [撰写博文](#撰写博文)
* 组件
	* [侧边栏](#侧边栏)
	* [迷你关于我](#mini-about-me)
	* [推荐标签](#featured-tags)
	* [好友链接](#friends)
	* [HTML5 演示文档布局](#keynote-layout)
* 评论与 Google/Baidu Analytics
	* [评论](#comment)
	* [网站分析](#analytics) 
* 高级部分
	* [自定义](#customization)
	* [标题底图](#header-image)
	* [搜索展示标题-头文件](#seo-title)



### 环境

如果你安装了 [jekyll](http://jekyllcn.com/)，那你只需要在命令行输入`jekyll serve` 或 `jekyll s`就能在本地浏览器中输入`http://127.0.0.1:4000/`预览主题，对主题的修改也能实时展示（需要强刷浏览器）。



### 开始

你可以通用修改 `_config.yml`文件来轻松的开始搭建自己的博客:

```
# Site settings
title: BY Blog                    # 你的博客网站标题
SEOTitle: 记得要让着本宝宝的博客 | BY Blog		# SEO 标题
description: "Hey"	   	   # 随便说点，描述一下

# SNS settings      
github_username: ckjcode     # 你的github账号
jianshu_username: e71990ada2fd  # 你的简书ID。

# Build settings
# paginate: 10              # 一页你准备放几篇文章
```

Jekyll官方网站还有很多的参数可以调，比如设置文章的链接形式...网址在这里：[Jekyll - Official Site](http://jekyllrb.com/) 中文版的在这里：[Jekyll中文](http://jekyllcn.com/).

### 撰写博文

要发表的文章一般以 **Markdown** 的格式放在这里`_posts/`，你只要看看这篇模板里的文章你就立刻明白该如何设置。

yaml 头文件长这样:

```
---
layout:     post
title:      定时器 你真的会使用吗？
subtitle:   iOS定时器详解
date:       2016-12-13
author:     BY
header-img: img/post-bg-ios9-web.jpg
catalog: 	 true
tags:
    - iOS
    - 定时器
---

```

### 侧边栏

设置是在 `_config.yml`文件里面的`Sidebar settings`那块。

```
# Sidebar settings
sidebar: true  #添加侧边栏
sidebar-about-description: "简单的描述一下你自己"
sidebar-avatar: /img/avatar-by.jpg     #你的大头贴，请使用绝对地址.注意：名字区分大小写！后缀名也是
```

侧边栏是响应式布局的，当屏幕尺寸小于992px的时候，侧边栏就会移动到底部。具体请见bootstrap栅格系统 <http://v3.bootcss.com/css/>


### Mini About Me

Mini-About-Me 这个模块将在你的头像下面，展示你所有的社交账号。这个也是响应式布局，当屏幕变小时候，会将其移动到页面底部，只不过会稍微有点小变化，具体请看代码。

### Featured Tags

看到这个网站 [Medium](http://medium.com) 的推荐标签非常的炫酷，所以我将他加了进来。
这个模块现在是独立的，可以呈现在所有页面，包括主页和发表的每一篇文章标题的头上。

```
# Featured Tags
featured-tags: true  
featured-condition-size: 1     # A tag will be featured if the size of it is more than this condition value
```

唯一需要注意的是`featured-condition-size`: 如果一个标签的 SIZE，也就是使用该标签的文章数大于上面设定的条件值，这个标签就会在首页上被推荐。
 
内部有一个条件模板 `{% if tag[1].size > {{site.featured-condition-size}} %}` 是用来做筛选过滤的.

### Social-media Account

在下面输入的社交账号，没有的添加的不会显示在侧边框中。新加入了[简书](https:/www.jianshu.com)链接,

	# SNS settings
	RSS: false
	jianshu_username: 	jianshu_id 
	zhihu_username:     username
	facebook_username:  username
	github_username:    username
	# weibo_username:   username
	
	

![](https://images.gitee.com/uploads/images/2019/0806/101951_5728933d_1593966.jpeg)

### Friends

好友链接部分。这会在全部页面显示。

设置是在 `_config.yml`文件里面的`Friends`那块，自己加吧。

```
# Friends
friends: [
    {
        title: "BY Blog",
        href: "https://ckjcode.gitee.io/"
    }
]
```


### Keynote Layout

HTML5幻灯片的排版：

![](https://images.gitee.com/uploads/images/2019/0806/102531_e98d2a90_1593966.jpeg)

这部分是用于占用html格式的幻灯片的，一般用到的是 Reveal.js, Impress.js, Slides, Prezi 等等.我认为一个现代化的博客怎么能少了放html幻灯的功能呢~

其主要原理是添加一个 `iframe`，在里面加入外部链接。你可以直接写到头文件里面去，详情请见下面的yaml头文件的写法。

```
---
layout:     keynote
iframe:     "http://huangxuan.me/js-module-7day/"
---
```

iframe在不同的设备中，将会自动的调整大小。保留内边距是为了让手机用户可以向下滑动，以及添加更多的内容。


### Comment

博客不仅支持 [Disqus](http://disqus.com) 评论系统,还加入了 [Gitalk](https://gitalk.github.io/) 评论系统，[支持 Markdwon 语法](https://guides.github.com/features/mastering-markdown/)，cool~

#### Disqus

优点：国际比较流行，界面也很大气、简洁，如果有人评论，还能实时通知，直接回复通知的邮件就行了；

缺点：评论必须要去注册一个disqus账号，分享一般只有Facebook和Twitter，另外在墙内加载速度略慢了一点。想要知道长啥样，可以看以前的版本点[这里](http://brucezhaor.github.io/about.html) 最下面就可以看到。

> Node：有很多人反映 Disqus 插件加载不出来，可能墙又架高了，有条件的话翻个墙就好了~

**使用：**

**首先**，你需要去注册一个Disqus帐号。**不要直接使用我的啊！**

**其次**，你只需要在下面的 yaml 头文件中设置一下就可以了。

```
# 评论系统
# Disqus（https://disqus.com/）
disqus_username: ChengKeJ
```

#### Gitalk

优点：界面干净简洁，利用 Github issue API 做的评论插件，使用 Github 帐号进行登录和评论，最喜欢的支持 Markdown 语法，对于程序员来说真是太 cool 了。

缺点：配置比较繁琐，每篇文章的评论都需要初始化。

**使用：**

参考我的这篇文章：[《为博客添加 Gitalk 评论插件》](http://ckjcode.gitee.io/2017/12/19/%E4%B8%BA%E5%8D%9A%E5%AE%A2%E6%B7%BB%E5%8A%A0-Gitalk-%E8%AF%84%E8%AE%BA%E6%8F%92%E4%BB%B6/)


### Analytics

网站分析，现在支持百度统计和Google Analytics。需要去官方网站注册一下，然后将返回的code贴在下面：

```
# Baidu Analytics
ba_track_id: 4cc1f2d8f3067386cc5cdb626a202900

# Google Analytics
ga_track_id: 'UA-49627206-1'            # 你用Google账号去注册一个就会给你一个这样的id
ga_domain: huangxuan.me			# 默认的是 auto, 这里我是自定义了的域名，你如果没有自己的域名，需要改成auto。
```

### Customization

如果你喜欢折腾，你可以去自定义这个模板的 Code。

**如果你可以理解 `_include/` 和 `_layouts/`文件夹下的代码（这里是整个界面布局的地方），你就可以使用 Jekyll 使用的模版引擎 [Liquid](https://github.com/Shopify/liquid/wiki)的语法直接修改/添加代码，来进行更有创意的自定义界面啦！**

### Header Image

博客每页的标题底图是可以自己选的，看看几篇示例post你就知道如何设置了。
  
标题底图的选取完全是看个人的审美了。每一篇文章可以有不同的底图，你想放什么就放什么，最后宽度要够，大小不要太大，否则加载慢啊。

> 上传的图片最好先压缩，这里推荐 imageOptim 图片压缩软件，让你的博客起飞。

但是需要注意的是本模板的标题是**白色**的，所以背景色要设置为**灰色**或者**黑色**，总之深色系就对了。当然你还可以自定义修改字体颜色，总之，用github pages就是可以完全的个性定制自己的博客。

### SEO Title

我的博客标题是 **“BY Blog”** 但是我想要在搜索的时候显示 **“记得要让着本宝宝的博客 | BY Blog”** ，这个就需要 SEO Title 来定义了。

其实这个 SEO Title 就是定义了<head><title>标题</title></head>这个里面的东西和多说分享的标题，你可以自行修改的。

### 关于收到"Page Build Warning"的 Email

由于jekyll升级到3.0.x,对原来的 pygments 代码高亮不再支持，现只支持一种-rouge，所以你需要在 `_config.yml`文件中修改`highlighter: rouge`.另外还需要在`_config.yml`文件中加上`gems: [jekyll-paginate]`.

同时,你需要更新你的本地 jekyll 环境.

使用`jekyll server`的同学需要这样：

1. `gem update jekyll` # 更新jekyll
2. `gem update github-pages` #更新依赖的包

使用`bundle exec jekyll server`的同学在更新 jekyll 后，需要输入`bundle update`来更新依赖的包.

> Note：
> 可以使用 `jekyll -s` 命令在本地实时配置博客，提高效率。详见 [Jekyll.com](http://jekyllcn.com/)

参考文档：[using jekyll with pages](https://help.github.com/articles/using-jekyll-with-pages/) & [Upgrading from 2.x to 3.x](http://jekyllrb.com/docs/upgrading/2-to-3/)

------------------------------

快速搭建教程：
---
layout:     post
title:      快速搭建个人博客
subtitle:   手把手教你在半小时内搭建自己的个人博客(如果不踩坑的话🙈🙊🙉)
date:       2017-02-06
author:     BY
header-img: img/post-bg-re-vs-ng2.jpg
catalog: true
tags:
    - Blog
---

> 正所谓前人栽树，后人乘凉。
> 
> 感谢[Huxpro](https://github.com/huxpro)提供的博客模板
> 
> [我的的博客](http://ckjcode.gitee.io)

# 前言
从 Jekyll 到 GitHub Pages 中间踩了许多坑，终于把我的个人博客[BY Blog](http://ckjcode.gitee.io)搭建出来了。。。

本教程针对的是不懂技术又想搭建个人博客的小白，操作简单暴力且快速。当然懂技术那就更好了。

看看看博客的主页样式：

在手机上的布局：

[![](http://upload-images.jianshu.io/upload_images/2178672-d58bb45f9faedb70.jpg)](http://ckjcode.gitee.io/)

废话不多说了，开始进入正文。

# 快速开始

### 从注册一个Gitee账号开始

我采用的搭建博客的方式是使用 [GitHub Pages](https://pages.github.com/) + [jekyll](http://jekyll.com.cn/) 的方式。

要使用 Gitee Pages，首先你要注册一个[Gitee](https://gitee.com/)账号


### 拉取我的博客模板

注册完成后搜索 `ckjcode.gitee.io` 进入[我的仓库](https://gitee.com/ckjcode/ckjcode)


![fork](https://images.gitee.com/uploads/images/2019/0806/105404_713dbdb0_1593966.png "fork.png")

点击右上角的 **Fork** 将我的仓库拉倒你的账号下

稍等一下，点击刷新，你会看到**Fork**了成功的页面


### 修改仓库名

点击**settings**进入设置

![setting](https://images.gitee.com/uploads/images/2019/0806/105637_bb023352_1593966.png "setting.png")

<p id = "Rename"></p>
修改仓库名为 `你的Gitee账号名`，然后 Rename


这时你在在浏览器中输入 `你的Github账号名.gitee.io` 例如:`ckjcode.gitee.io`

你将会看到如下界面

![输入图片说明](https://images.gitee.com/uploads/images/2019/0806/105826_2cb3bd35_1593966.jpeg "logo2.jpg")

说明已经成功一半了😀。。。当然，还需要修改博客的配置才能变成你的博客。

若是出现

![](http://upload-images.jianshu.io/upload_images/2178672-cfd55a22902a9d2c.jpg?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

则需要 [检查一下你的仓库名是否正确](#Rename)

### 整个网站结构

修改Blog前我们来看看Jekyll 网站的基础结构，当然我们的网站比这个复杂。

```
├── _config.yml
├── _drafts
|   ├── begin-with-the-crazy-ideas.textile
|   └── on-simplicity-in-technology.markdown
├── _includes
|   ├── footer.html
|   └── header.html
├── _layouts
|   ├── default.html
|   └── post.html
├── _posts
|   ├── 2007-10-29-why-every-programmer-should-play-nethack.textile
|   └── 2009-04-26-barcamp-boston-4-roundup.textile
├── _data
|   └── members.yml
├── _site
├── img
└── index.html
```

很复杂看不懂是不是，不要紧，你只要记住其中几个OK了

- `_config.yml` 全局配置文件
- `_posts`	放置博客文章的文件夹
- `img`	存放图片的文件夹

其他的想继续深究可以[看这里](http://jekyll.com.cn/docs/structure/)



### 修改博客配置

来到你的仓库，找到`_config.yml`文件,这是网站的全局配置文件。

![输入图片说明](https://images.gitee.com/uploads/images/2019/0806/105947_e1bedc0d_1593966.png "config.png")

点击修改


然后编辑`_config.yml`的内容
![输入图片说明](https://images.gitee.com/uploads/images/2019/0806/110022_1cde69a8_1593966.png "222.png")

接下来我们来详细说说以下配置文件的内容：

#### 基础设置

```
# Site settings
title: You Blog    				  	#你博客的标题
SEOTitle: 你的博客 | You Blog    	 #显示在浏览器上搜索的时候显示的标题
header-img: img/post-bg-rwd.jpg  	#显示在首页的背景图片
email: You@gmail.com	
description: "You Blog"  			 #网站介绍
keyword: "BY, BY Blog, 记得要让着本宝宝的博客, ckjcode,, iOS, Apple, iPhone" #关键词
url: "https://ckjcode.gitee.io"          # 这个就是填写你的博客地址
baseurl: ""      # 这个我们不用填写

```
#### 侧边栏

```
# Sidebar settings
sidebar: true                           # 是否开启侧边栏.
sidebar-about-description: "说点装逼的话。。。"
sidebar-avatar:/img/avatar-by.JPG      # 你的个人头像 这里你可以改成我在img文件夹中的两张备用照片 img/avatar-m 或 avatar-g
```
#### 社交账号
展示你的其他社交平台

![](http://upload-images.jianshu.io/upload_images/2178672-ec775a22f76e2f40.jpg?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

在下面你的社交账号的用户名就可以了，若没有可不用填

```
# SNS settings
RSS: false
weibo_username:     username
zhihu_username:     username
github_username:    username
facebook_username:  username
jianshu_username:	jianshu_id
```

新加入了**简书**，`jianshu_id` 在你打开你的简书主页后的地址如：`http://www.jianshu.com/u/xxxx`中，后面这一串数字：`xxxx`

#### 评论系统


博客中使用的是 [Disqus](https://disqus.com/) 评论系统，在 [官网](https://disqus.com/) 注册帐号后，按下面的步骤简单的配置即可：

进入 [设置页面](https://disqus.com/home/settings/profile/) 配置个人信息

![配置 Disqus 个人信息](http://upload-images.jianshu.io/upload_images/2178672-904ecb30c536c73b.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

找到 **Username**

![Disqus Account](http://upload-images.jianshu.io/upload_images/2178672-19d1b9e7d2624bfb.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

这个 **Username**  就是我们 `_config.yml` 中 `disqus_username`

```
# Disqus settings（https://disqus.com/）
disqus_username: ckjcode
```

> 很对人反映 Disqus 评论插件加载不出来，因为 Disqus 在国内加载缓慢，所以我新集成了 Gitalk 评论插件（感谢[@FeDemo](https://github.com/FeDemo)的推荐），喜欢折腾的朋友可以看这篇：[《为博客添加 Gitalk 评论插件》](http://ckjcode.gitee.io/2017/12/19/%E4%B8%BA%E5%8D%9A%E5%AE%A2%E6%B7%BB%E5%8A%A0-Gitalk-%E8%AF%84%E8%AE%BA%E6%8F%92%E4%BB%B6/)。 我已经在`_config.yml` 配置就好了，只需要填写参数可以了。

#### 网站统计

集成了 [Baidu Analytics](http://tongji.baidu.com/web/welcome/login) 和 [Google Analytics](http://www.google.cn/analytics/)，到各个网站注册拿到track_id替换下面的就可以了

这是我的 Google Analytics

![](http://upload-images.jianshu.io/upload_images/2178672-c36b895c53196fdb.jpg?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

**不要使用我的track_id**😂。。。

若不想启用统计，直接删除或注释掉就可以了

```
# Analytics settings
# Baidu Analytics
ba_track_id: 83e259f69b37d02a4633a2b7d960139c

# Google Analytics
ga_track_id: 'UA-90855596-1'            # Format: UA-xxxxxx-xx
ga_domain: auto
```

#### 好友

```
friends: [
    {
        title: "简书·BY",
        href: "http://www.jianshu.com/u/xxx"
    },{
        title: "Apple",
        href: "https://apple.com"
    },{
        title: "Apple Developer",
        href: "https://developer.apple.com/"
    }
]
```


恭喜你，你的个人博客搭建完成了😀。

# 写文章

利用 Github网站 ，我们可以不用学习[git](https://git-scm.com/)，就可以轻松管理自己的博客

对于轻车熟路的程序猿来说，使用git管理会更加方便。。。

## 创建
文章统一放在网站根目录下的 `_posts` 的文件夹中。

![](http://upload-images.jianshu.io/upload_images/2178672-fb74cdc11a950bd4.jpg?imageMogr2/auto-orient/strip%7Cimag![输入图片说明](https://images.gitee.com/uploads/images/2019/0806/111015_f9478619_1593966.png "post.png")

创建一个文件

![输入图片说明](https://images.gitee.com/uploads/images/2019/0806/111126_5fa14c15_1593966.png "333.png")

在下面写文章，和标题，还能实时预览，最后提交保存就能看到自己的新文章了。



## 格式
每一篇文章文件命名采用的是`2017-02-04-Hello-2017.md`时间+标题的形式，空格用`-`替换连接。

文件的格式是 `.md` 的 [**MarkDown**](http://sspai.com/25137/) 文件。

我们的博客文章格式采用是 **MarkDown**+ **YAML** 的方式。

[**YAML**](http://www.ruanyifeng.com/blog/2016/07/yaml.html?f=tt) 就是我们配置 `_config`文件用的语言。

[**MarkDown**](http://sspai.com/25137/) 是一种轻量级的「标记语言」，很简单。[花半个小时看一下](http://sspai.com/25137)就能熟练使用了

大概就是这么一个结构。

```
---
layout:     post   				    # 使用的布局（不需要改）
title:      My First Post 				# 标题 
subtitle:   Hello World, Hello Blog #副标题
date:       2017-02-06 				# 时间
author:     BY 						# 作者
header-img: img/post-bg-2015.jpg 	#这篇文章标题背景图片
catalog: true 						# 是否归档
tags:								#标签
    - 生活
---

## Hey
>这是我的第一篇博客。

进入你的博客主页，新的文章将会出现在你的主页上.
```

按格式创建文章后，提交保存。进入你的博客主页，新的文章将会出现在你的主页上.


到这里，恭喜你！

你已经成功搭建了自己的个人博客以及学会在博客上撰写文字的技能了（是不是有点小兴奋🙈）。


#### 首页标签

在首页可以看到这些特色标签，当你的文章出现相同标签（默认相同的**标签数量大于1**），才会自动生成。

所以当你只放一篇文章的时候是不会出现标签的。



![](http://upload-images.jianshu.io/upload_images/2178672-9281b7176c456f92.jpg?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)


建站的初期，博客比较少，若你想直接在首页生成比较多的标签。你可以在 `_congfig.yml`中找到这段：

```
# Featured Tags
featured-tags: true                     # 是否使用首页标签
featured-condition-size: 1              # 相同标签数量大于这个数，才会出现在首页
```

将其修改为`featured-condition-size: 0`, 这样只有一个标签时也会出现在首页了。

相反，当你博客比较多，标签也很多时，这时你就需要改回 `1` 甚至是 `2` 了。


# 自定义域名

搭建好博客之后 你可能不想直接使用 [baiyingqiu.github.io](http://ckjcode.gitee.io) 这么长的博客域名吧, 想换成想 [ckjcode.gitee.io](http://ckjcode.gitee.io) 这样简短的域名。那我们开始吧！

#### 购买域名
首先，你必须购买一个自己的域名。

我是在[阿里云](https://wanwang.aliyun.com/domain/?spm=5176.8006371.1007.dnetcndomain.q1ys4x)购买的域名

![](http://upload-images.jianshu.io/upload_images/2178672-ef3844cab15e35ff.jpg?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

用**阿里云** app也可以注册域名，域名的价格根据后缀的不同和域名的长度而分，比如我这个 `ckjcode.gitee.io` 的域名第一年才只要4元~

域名尽量选择短一点比较好记住，注意，不能选择中文域名，比如 `张三.top` ,GitHub Pages **无法处理中文域名**，会导致你的域名在你的主页上使用。

注册的步骤就不在介绍了

#### 解析域名

注册好域名后，需要将域名解析到你的博客上

管理控制台 → 域名与网站（万网） → 域名

![](http://upload-images.jianshu.io/upload_images/2178672-9a75bba50d1b14d7.jpg?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

选择你注册好的域名，点击解析

![](http://upload-images.jianshu.io/upload_images/2178672-0968a8dd2045f4fd.jpg?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

添加解析

分别添加两个`A` 记录类型,

一个主机记录为 `www`,代表可以解析 `www.ckjcode.gitee.io`的域名

另一个为 `@`, 代表 `ckjcode.gitee.io`

记录值就是我们博客的IP地址，是 GitHub Pagas 在美国的服务器的地址 `151.101.100.133`



可以通过 [这个网站](http://ip.chinaz.com/)  或者直接在终端输入`ping 你的地址`，查看博客的IP


细心地你会发现所有人的博客都解析到 `151.101.100.133` 这个IP。

然后 Gitee Pages 再通过 CNAME记录 跳转到你的主页上。


#### 修改CNAME

最后一步，只需要修改 我们github仓库下的 **CNAME** 文件。

选择 **CNAME** 文件

没有的话自己新建一个 

这时，输入你自己的域名，就可以解析到你的主页了。

大功告成！

# 进阶

若你对博客模板进行修改，你就要看看 Jekyll 的[开发文档](http://jekyll.com.cn),是中文文档哦，对英语一般的朋友简直是福利啊（比如说我😀）。

还要学习 **Git** 和 **GitHub** 的工作机制了及使用。

你可以先看看这个[git教程](http://www.liaoxuefeng.com/wiki/0013739516305929606dd18361248578c67b8067c8c017b000/)，对git有个初步的了解后，那么相信你就能将自己图片传到GitHub仓库上，或者可以说掌握了 **使用git管理自己的GitHub仓库** 的技能呢。

对于轻车熟路的程序猿来说，这篇教程就算就结束了，因为下面的内容对于你们来说 so eazy~

但相信很多小白都一脸懵逼，那我们继续👇。


当你对仓库文件夹的文件下进行修改、添加或删除时，都可以在 **GitHub Desktop** 中看到

例如我在 `img` 中添加了一张图片 `avatar-demo.png` 添加了一张图片

就可以在看到**GitHub Desktop**显示了我的修改

保存修改只要按 **Commit to master**，然后可以写上你的修改说明

![](http://upload-images.jianshu.io/upload_images/2178672-4bfbfec37cbb8eb6.jpg?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

#### 同步

将修改同步到 **GitHub** 远程仓库上只需要一步：点击右上角的**同步按钮**

![](http://upload-images.jianshu.io/upload_images/2178672-3c2ee8234a7f1832.jpg?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

#### 完成

打开你的GitHub上的仓库，你就可以看到已经和本地同步了

可以看到你提交的详情： `add img` 


这样，你已经能轻松管理自己的博客了。

想上传头像，背景，或者是删掉你不要的图片（我的头像😏）已经是 so eazy了吧~

#### 注意
你在 **GitHub** 网站上进行 **Commit** 操作后，需要在**GitHub Desktop**上按一下 **同步按键** 才能同步网站上的修改到你的本地。


# 修改个人介绍




修改个人介绍需要修改根目录下的 `about.html` 文件



看不懂 HTML 标签？没关系，对照着修改就好了~ 还有注意这个有中英介绍


# 常见问题

最近有很多人给我提问题，我这边总结一下

#### 配置文件修改后没有效果
刷新几遍浏览器就好了~

不行的话，先清除浏览器缓存再试试。

#### 404错误

1. 检查你的仓库名是否有按照要求填写
2. 确定 **Fork** 的是不是我的仓库~

#### 修改CNAME文件，域名还是不变

清除浏览器缓存就OK~

#### 其他问题

直接在评论中提出来或私信我，我会一一替大家解决的😀


# 其他

最近有人往我的远程仓库不停的 **push**，一天连收几十封邮件！例如像这样的

![](http://upload-images.jianshu.io/upload_images/2178672-1347f2cc9a4a8dc8.jpg?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

原因大多是直接Clone了我的仓库到本地，**没有删除我的远程仓库地址**，添加完自己的仓库地址后，一口气推送到所有远程仓库（包括我的😂）~

打扰了我的工作和生活~

所以，**请不要往我的仓库上推送分支**！

我发现一个问题是，很多人每次修改博客的内容都commit一次到远程仓库，然后再查看修改结果，这样效率非常低！

#### 来，上车！

## 在本地调试博客

> 注：下面的操作是在 **Mac** 终端进行的。
> **Windows** 环境下的配置请参考 [@梦幻之云](http://www.jianshu.com/u/a13e7484dc21) 提供的 [这篇文章](https://agcaiyun.cn/2017/09/10/%E6%90%AD%E5%BB%BA%E4%B8%AA%E4%BA%BA%E5%8D%9A%E5%AE%A2/)。

有心的同学在 [jekyll官网](http://jekyllcn.com/) 就会发现 `jekyll` 的 提供的实例代码。

```
~ $ gem install jekyll bundler
~ $ jekyll new my-awesome-site
~ $ cd my-awesome-site
~/my-awesome-site $ bundle install
~/my-awesome-site $ bundle exec jekyll serve
# => 打开浏览器 http://localhost:4000
```


这段命令创建了一个默认的 `jekll` 网站，然后在本机的 4000 窗口展示。聪明的你应该发现怎么做了吧~

安装 `jekyll`和 `jekyll bundler`

```
$ gem install jekyll
$ gem install jekyll bundler
```

进入你的 **Blog 所在目录**，然后创建本地服务器

```
$ jekyll s

```

然后会显示 

```
 Auto-regeneration: enabled for '/Users/baiying/Blog'
Configuration file: /Users/baiying/Blog/_config.yml
    Server address: http://127.0.0.1:4000/
  Server running... press ctrl-c to stop.
```

你就可以在 <http://127.0.0.1:4000/> 看到你的博客，你对本地博客的修改都会在这个地址进行显示，这大大提高了对博客的配置效率。

使用`ctrl+c`就可以停止 **serve**

# Star

若本教程顺利帮你搭建了自己的个人博客，请不要 **害羞**，给我的 [github仓库](https://gitee.com/ckjcode/ckjcode) 点个 **star** 吧！

因为最近发现 Fork 将近破百，加上直接 Clone 仓库的，保守估计已经帮助上百人成功的搭建了自己的博客，~~可是 Star 却仅仅只有 **12**！可能还是做的不够好吧！~~现在已经破百了，感谢大家的Star！

### **别无他求，点个 [Star](https://gitee.com/ckjcode/ckjcode) 吧**！



**心满意足！**

# 补充

#### 修改网站的 **icon**


要修改如图所示的网站 **icon**：

在博客 `img` 目录下找到并替换 `favicon.ico` 这个图标即可，图标尺寸为`32x32`。






## 致谢

1. 这个模板是从这里 [Hux](https://github.com/Huxpro/huxpro.github.io) || https://github.com/qiubaiying/qiubaiying.github.io fork 的, 感谢这个作者。 
2. 感谢 Jekyll、Github Pages 和 Bootstrap!

## License

遵循 MIT 许可证。有关详细,请参阅 [LICENSE]。

