---
layout:     post
title:      Unity开发Android必要的基础知识（一）
subtitle:   Keep And Accept Change
date:       2022-08-16 21:49:22+0800
author:     打个大西瓜
# header-img: img/post-bg-hacker.jpg
catalog: true
tags:
    - Android
---

# Android四大组件之Activity
> 四大组件是构成Android应用的基本组件
- Activity
- Service
- Broadcast reciver
- Content provider
## Activity

### 概念
> 摘抄自官网   

移动应用体验与桌面体验的不同之处在于，用户与应用的互动并不总是在同一位置开始，而是经常以不确定的方式开始。例如，如果您从主屏幕打开电子邮件应用，可能会看到电子邮件列表，如果您通过社交媒体应用启动电子邮件应用，则可能会直接进入电子邮件应用的邮件撰写界面。

Activity 类的目的就是促进这种范式的实现。当一个应用调用另一个应用时，调用方应用会调用另一个应用中的 Activity，而不是整个应用。通过这种方式，Activity 充当了应用与用户互动的入口点。您可以将 Activity 实现为 Activity 类的子类。

Activity 提供窗口供应用在其中绘制界面。此窗口通常会填满屏幕，但也可能比屏幕小，并浮动在其他窗口上面。通常，一个 Activity 实现应用中的一个屏幕。例如，应用中的一个 Activity 实现“偏好设置”屏幕，而另一个 Activity 实现“选择照片”屏幕。

大多数应用包含多个屏幕，这意味着它们包含多个 Activity。通常，应用中的一个 Activity 会被指定为主 Activity，这是用户启动应用时出现的第一个屏幕。然后，每个 Activity 可以启动另一个 Activity，以执行不同的操作。例如，一个简单的电子邮件应用中的主 Activity 可能会提供显示电子邮件收件箱的屏幕。主 Activity 可能会从该屏幕启动其他 Activity，以提供执行写邮件和打开邮件这类任务的屏幕。

虽然应用中的各个 Activity 协同工作形成统一的用户体验，但每个 Activity 与其他 Activity 之间只存在松散的关联，应用内不同 Activity 之间的依赖关系通常很小。事实上，Activity 经常会启动属于其他应用的 Activity。例如，浏览器应用可能会启动社交媒体应用的“分享”Activity。

要在应用中使用 Activity，您必须在应用的**清单中注册关于 Activity 的信息**，并且必须适当地管理 Activity 的**生命周期**

> 刚接触时可以简单理解为一个Activity是用户界面的载体，Android应用与用户交互的基础，而每个应用都有一个入口界面，俗称闪屏界面，也可能没有，入口直接就是主界面，那么多界面，怎么指定哪个是入口呢，这就是要在清单文件（AndroidManifest.xml）中用过滤器标签来标记告诉系统，应用启动后第一个先打开这个界面。

### 清单文件中Activity的配置
***每个Activity类都要在清单文件中声明***
#### 声明Activity
```xml
    <manifest ... >
      <application ... >
          <activity android:name=".ExampleActivity" />
          ...
      </application ... >
      ...
    </manifest >
```
#### 声明Intent过滤器
Intent 过滤器是 Android 平台的一项非常强大的功能。借助这项功能，您不但可以根据显式请求启动 Activity，还可以根据隐式请求启动 Activity。例如，显式请求可能会告诉系统“在 Gmail 应用中启动‘发送电子邮件’的Activity”，而隐式请求可能会告诉系统“在任何能够完成此工作的 Activity 中启动‘发送电子邮件’屏幕”。当系统界面询问用户使用哪个应用来执行任务时，这就是 intent 过滤器在起作用。

要使用此功能，您需要在 <activity> 元素中声明 <intent-filter> 属性。此元素的定义包括 <action> 元素，以及可选的 <category> 元素和/或 <data> 元素。这些元素组合在一起，可以指定 Activity 能够响应的 intent 类型。例如，以下代码段展示了如何配置一个发送文本数据并接收其他 Activity 的文本数据发送请求的 Activity
```xml
    <activity android:name=".ExampleActivity" android:icon="@drawable/app_icon">
        <intent-filter>
            <action android:name="android.intent.action.SEND" />
            <category android:name="android.intent.category.DEFAULT" />
            <data android:mimeType="text/plain" />
        </intent-filter>
    </activity>
```
在此示例中，<action> 元素指定该 Activity 会发送数据。将 <category> 元素声明为 DEFAULT 可使 Activity 能够接收启动请求。<data> 元素指定此 Activity 可以发送的数据类型。以下代码段展示了如何调用上述 Activity
```java
    // Create the text message with a string
    Intent sendIntent = new Intent();
    sendIntent.setAction(Intent.ACTION_SEND);
    sendIntent.setType("text/plain");
    sendIntent.putExtra(Intent.EXTRA_TEXT, textMessage);
    // Start the activity
    startActivity(sendIntent);
```
