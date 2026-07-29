---
title: Windows10 运行安卓模拟器蓝屏解决方案
author: 阿星𝑷𝒍𝒖𝒔
date: 2019-08-30 09:45:30
categories: Other
tags:
  - Windows
  - 安卓模拟器
  - 蓝屏
---

由于没有安卓机，想要测试一些东西，所以选择了安卓模拟器，可是一运行模拟器就导致电脑蓝屏，试了 N 次都不行。

于是在网上寻找解决方案，了解到导致蓝屏的原因都是因为虚拟化技术，我的系统是 Windows10 1903，加上之前开启了 Hyper-V 虚拟机，和 Windows 沙盒，再加上 Win10 对于安卓模拟器的虚拟化兼容不够才一直崩溃。

解决方案：关闭 Hyper-V 和 Windows 沙盒，运行以下命令，重启电脑。

```shell
DISM /Online /Disable-Feature /FeatureName:"Containers-DisposableClientVM"
DISM /Online /Disable-Feature /FeatureName:"Microsoft-Hyper-V-All"
DISM /Online /Disable-Feature /FeatureName:"VirtualMachinePlatform"
```
