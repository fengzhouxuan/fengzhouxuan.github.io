---
layout:     post
title:      Unity开发之Android必要的基础知识（三）
subtitle:   Gradle基础知识
date:       2022-08-22 20:30:22+0800
author:     打个大西瓜
header-img: img/post_bg-ios-android.png
# music-id: https://music.163.com/song?id=416892296&userid=50394461
catalog: true
tags:
    - Android
---

# Gradle
## 什么是Gradle
Gradle是一款基于Apache的Ant和Maven概念的项目自动化开源构建工具，是Android的主流构建工具

首先看看Unity导出的Android工程中的gradle文件在目录中的位置

![文件目录](/img/android-img//android-project.jpg)

Unity导出为Gradle工程时，Unity会创建拥有两个模块的Gradle工程

**❗️launcher**
作为启动unityLibrary模块的简单android应用，这个模块可以用别的android应用替换

**❗️unityLibrary**
unityLibrary包含了unity运行时以及资源和数据，这个模块作为一个库可以整合到任何一个Gradle项目中，

也就是说，Unity在导出到android后，自动为我们创建了一个简单的android工程，以及一个启动模块，和一个包含所有unity相关运行时、资源、数据的库模块，启动模块负责依赖库模块，并且启动它

**图中编号对应的gradle文件：**

1. launcher模块级 build.gradle
2. unityLibrary模块级 build.gradle
3. 项目级 build.gradle
4. 项目级 settings.gradle

## launcher模块级 build.gradle

launcher模块是工程的启动模块
``` js
// GENERATED BY UNITY. REMOVE THIS COMMENT TO PREVENT OVERWRITING WHEN EXPORTING AGAIN

//定义模块属性
//com.android.application : 
//      application属性，可以独立运行的Android程序，也就是我们的APP；
//com.android.library : 
//      library属性，不可以独立运行，一般是Android程序依赖的库文件
//      上文提到的unity模块就是这个属性，只能被依赖，不能独立运行
apply plugin: 'com.android.application'

//依赖项
dependencies {
    //依赖unityLibrary，unity编译后的所有资源全部在unityLibrary模块中
    implementation project(':unityLibrary')
    }

android {
    compileSdkVersion 29    //编译环境下的sdk版本,IDE会基于这个版本提供开发环境的功能
    buildToolsVersion '30.0.2'  //指定项目构建工具的版本.

    compileOptions {
        // encoding 'UTF-8' //加载的 Java 源文件的编码 , 默认为 UTF-8 , 类型为字符串

        // incremental true //是否启用 gradle 新增加的 增量模式，默认True

        sourceCompatibility JavaVersion.VERSION_1_8  //编译使用的 Java 版本 
        targetCompatibility JavaVersion.VERSION_1_8  //生成 Java 字节码版本 
    }

    defaultConfig {

        minSdkVersion 21  //最低支持的sdk版本
        
        //向前兼容，比如某个Api在不同版本里功能发生了变化，记作a和b
        //那么不同的版本的系统会根据targetSdkVersion来决定用a还是b
        targetSdkVersion 29     
        applicationId 'xxx.xxx.xxx'
        ndk {
            abiFilters 'armeabi-v7a', 'arm64-v8a'
        }
        versionCode 1101
        versionName '1.101'
    }

    //aapt全称Android Asset Packaging Tool 即编译资源文件的工具
    aaptOptions {
        //不压缩
        noCompress = ['.unity3d', '.ress', '.resource', '.obb', '.gitkeep']
        //忽略
        ignoreAssetsPattern = "!.svn:!.git:!.ds_store:!*.scc:.*:!CVS:!thumbs.db:!picasa.ini:!*~"
    }

    //签名文件配置
    signingConfigs {
        release {
            storeFile file('xxx/xx/xxx/xxx/xxx.keystore')
            storePassword 'xxx'
            keyAlias 'xxx'
            keyPassword 'xxx'
        }
    }

    // 代码检查工具
    lintOptions {
        abortOnError false
    }

    buildTypes {
        debug {
            minifyEnabled false
            useProguard false
            proguardFiles getDefaultProguardFile('proguard-android.txt')
            signingConfig signingConfigs.release
            jniDebuggable true
        }
        release {
            minifyEnabled false
            useProguard false
            proguardFiles getDefaultProguardFile('proguard-android.txt')
            signingConfig signingConfigs.release
        }
    }

    //打包成APK配置的选项
    // pickFirsts ——当出现重复文件 会使用第一个匹配的文件打包进入apk，默认为空
    // merges ——当出现重复文件时合并重复的文件打包进入apk，默认值为/META-INF/services/**，
    // 调用merge方法时候不会附加默认值，而调用setMerges会覆盖掉默认值
    // excludes ——打包的时候排除匹配的文件
    packagingOptions {
        doNotStrip '*/armeabi-v7a/*.so'
        doNotStrip '*/arm64-v8a/*.so'
    }

    bundle {

        //封装用于构建每种语言（或语言环境）对应的APK的设置
        language {
            enableSplit = false
        }

        //封装用于构建每屏幕密度对应的APK的设置
        density {
            enableSplit = false
        }

        //封装用于构建每个ABI 对应的APK的设置
        abi {
            enableSplit = true
        }
    }
}

```

## unityLibrary模块级 build.gradle
和launcher其实没多大区别，以后再补充 

## 项目级 build.gradle

也叫顶级build.gradle

```js
// GENERATED BY UNITY. REMOVE THIS COMMENT TO PREVENT OVERWRITING WHEN EXPORTING AGAIN

allprojects {
    // 这里面是gradle脚本执行所需依赖，分别是对应的maven库和插件库。
    buildscript {
        // Maven库
        repositories {
            google()  // google的Maven库
            jcenter()
        }
        // 依赖
        dependencies {
            classpath 'com.android.tools.build:gradle:4.1.0'
            
        }
    }
    // 项目中的所有module配置的共同模块
    repositories {
        google()
        jcenter()
        // 库存放路径
        flatDir {
            dirs "${project(':unityLibrary').projectDir}/libs"
        }
        // 其他库
        maven { url "https://sdk.tapjoy.com/" }
        maven { url 'https://android-sdk.is.com/' }
        maven { url 'https://verve.jfrog.io/artifactory/verve-gradle-release' }
        maven { url "https://dl-maven-android.mintegral.com/repository/mbridge_android_sdk_oversea" }
        maven { url 'https://artifact.bytedance.com/repository/pangle' }
    }
}

task clean(type: Delete) {
    delete rootProject.buildDir
}

```

## 项目级 settings.gradle
工程配置文件
该文件一般情况下不需要修改
```js
    //项目包含的模块
    include ':launcher', ':unityLibrary'
```

> 关于Unity导出Android的常用Gradle文件就这些了，其实还有很多配置，但是掌握上文这些基本够用了

***TO BE CONTINUE!***