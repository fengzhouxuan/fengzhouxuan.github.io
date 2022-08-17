---
layout:     post
title:      Unity开发Android必要的基础知识（二）
subtitle:   AndroidManifest清单文件
date:       2022-08-17 16:40:22+0800
author:     打个大西瓜
header-img: img/post-bg-hacker.jpg
catalog: true
tags:
    - Android
---
# AndroidManifest清单文件
**[官方文档](https://developer.android.com/guide/topics/manifest/manifest-intro)**
## 概念

清单文件用于向 Android 构建工具、Android 操作系统和 Google Play 描述应用的基本信息

**划重点，清单文件需声明以下内容：**

- **声明包名、icon、SDK等等应用信息：**  应用的软件包名称，其通常与代码的命名空间相匹配。 构建项目时，Android 构建工具会使用此信息来确定代码实体的位置。 打包应用时，构建工具会使用 Gradle 构建文件中的应用 ID 来替换此值，而此 ID 则用作系统和 Google Play 上的唯一应用标识符。

- **注册四大组件：** 应用的组件，包括所有 Activity、Service、Broadcast reciver和Content provider。 每个组件都必须定义基本属性，例如其 Kotlin 或 Java 类的名称。 清单文件还能声明一些功能，例如其所能处理的设备配置，以及描述组件如何启动的 Intent 过滤器。

- **申请必要的权限：** 应用为访问系统或其他应用的受保护部分所需的权限。 如果其他应用想要访问此应用的内容，则清单文件还会声明其必须拥有的权限。

- **应用需要的硬件和软件功能：** 这些功能会影响哪些设备能够从 Google Play 安装应用

## 标签
对于在应用中创建的每个应用组件，您必须在清单文件中声明相应的 XML 元素：

- ```<activity>``` 用于 ```Activity``` 的每个子类。
- ```<service>``` 用于 ```Service``` 的每个子类。
- ```<receiver>``` 用于 ```BroadcastReceiver``` 的每个子类。
- ```<provider>``` 用于 ```ContentProvider``` 的每个子类。

**如果您创建此类组件的任何子类，但未在清单文件中对其进行声明，则系统便无法启动该子类。**

默认清单文件

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.example.myapplication">

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/Theme.MyApplication">
        <activity
            android:name=".MainActivity"
            android:label="@string/app_name">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>

</manifest>
```

### applicaltion标签
[官方文档](https://developer.android.com/guide/topics/manifest/application-element)

二级标签，配置项目级的参数，如 debuggable、enabled、description 和 allowClearUserData，或者为组件属性设置全局默认值，且组件可以再自己的标签内定义覆盖，比如icon、label等。

<font size=4> 包含于:</font>

 ```xml
 <manifest>
 ```

 <font size=4> 可包含:</font>
 
 ``` xml
<activity>
<activity-alias>
<meta-data>
<service>
<receiver>
<profileable>
<provider>
<uses-library>
<uses-native-library>
```