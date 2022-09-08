---
layout:     post
title:      Unity Tips (持续更新)
subtitle:   收集记录零碎的小知识
date:       2022-09-02 18:40:22+0800
author:     打个大西瓜
header-img: img/home-bg-o.jpg
catalog: true
tags:
    - Unity
---

### FormerlySerializedAs特性

作用就是防止置序列化的数据在变量重命名后丢失
打个比方:
```java
public class FormerlySerializedAsTest : MonoBehaviour
{
    public string MyName;
}
```

定义了一个 ```MyName``` 的 ```string```，在面板上赋值为 ```“打个大西瓜”```
然后出于某种原因需要重命名 ```MyName``` 为 ```MyNickname```,那么面板上赋值的 ```“打个大西瓜”```就没了，变成了空

为了让```MyNickname```继承之前的值，就需要加上 ```FormerlySerializedAs``` 特性

```java
public class FormerlySerializedAsTest : MonoBehaviour
{
    [FormerlySerializedAs("MyName")]
    public string MyName;
}
```
但是要注意参数，也不是随便传一个string的 ，看看定义 ```FormerlySerializedAs(string oldName)``` ，参数名叫oldName，也就是旧的名字，重命名前的名字，所以我这里传的 ```”MyName“``` ，这样就相当于保存了```MyName```序列化的数据，然后再重命名为 ```MyNickname``` 时，就会把之前```MyName```序列化的数据赋值给 ```MyNickname```

### Vector3 UnityEngine.Random.onUnitSphere
随机返回单位球表面的点

### Vector3 UnityEngine.Random.insideUnitSphere
随机返回单位球内的点

### Vector2 UnityEngine.Random.insideUnitCircle
随机返回单位圆内的点