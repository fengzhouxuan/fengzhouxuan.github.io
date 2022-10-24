---
layout:     post
title:      Andoird Gradle排除aar包中引用的其他包解决引用冲突
subtitle:   Keep And Accept Change
date:       2022-10-24 14:50:22+0800
author:     打个大西瓜
header-img: img/post_bg-ios-android.png
catalog: true
tags:
    - Android
---

随着接入的三方库越来越多，依赖的不管是jar包还是aar包也越来越多，依赖包之间的冲突经常出现,所以做个总结记录
## 定位冲突的包
首先需要找到哪些包冲突了，有些冲突的包是被其他包引用的，所以肉眼是看不出来的，比如 A包和B包冲突，是因为B包自己依赖了一个其他版本的A包，这个时候就需要定位

在Android Studio中的控制台输入命令
```./gradlew -q app:dependencies``` 其中```app```需要替换成当前的项目的模块，在unity开发中基本是```unityLibrary```，这条命令会列出指定模块的依赖树

比如  
我的项目中有两个依赖：  
```implementation ('com.google.android.gms:play-services-ads-identifier:18.0.1')```  
```implementation(name: 'com.google.android.gms.play-services-basement-18.0.0', ext:'aar')```

生成的依赖树为：  
```
+--- :com.google.android.gms.play-services-basement-18.0.0

+--- com.google.android.gms:play-services-ads-identifier:18.0.1
|    \--- com.google.android.gms:play-services-basement:18.0.0
|         +--- androidx.collection:collection:1.0.0
|   --- 等等其他一大串 ---
```
可以看出其中```play-services-ads-identifier```依赖了```play-services-basement```，所以产生了冲突 
## 解决冲突
现在有两个方案解决冲突

第一种，直接删掉 ```implementation(name: 'com.google.android.gms.play-services-basement-18.0.0', ext:'aar')```，这个最简单  

第二种，把 ```com.google.android.gms:play-services-ads-identifier:18.0.1' ``` 对 ``` com.google.android.gms.play-services-basement-18.0.0' ```的依赖干掉，这种方式更加的灵活，有时候是不能直接删掉依赖的，就需要用这种方法  
具体操作  
```
implementation ('com.google.android.gms:play-services-ads-identifier:18.0.1'){
        exclude group: 'com.google.android.gms',module:'play-services-basement'
    }
```
意思就是排除依赖，其中 ```group```接收的参数就是具体的包，```module```是该包所在模块，这个可以在依赖树 ```com.google.android.gms:play-services-basement```中看到以```：```分割

因为排除的是aar包，所以存在```module```参数，如果是jar包是不需要 ```module``` 的，具体没有试验过