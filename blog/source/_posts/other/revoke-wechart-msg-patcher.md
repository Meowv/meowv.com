---
title: PC版微信防撤回补丁
author: 阿星𝑷𝒍𝒖𝒔
date: 2019-08-29 11:36:00
categories: Other
tags:
  - 微信
---

前两天看 GitHub 发现一个有趣的项目，[PC 微信防撤回补丁](https://github.com/huiyadanli/RevokeMsgPatcher)，本着研究学习的目的，在看过源码，一顿疯狂操作之后，了解了其原理是基于修改 wechatwin.dll 达到防撤回的。

于是乎，自己动手玩一玩，以下为详细步骤：

首先下载 [x64dbg](https://github.com/x64dbg/x64dbg)，我这里使用的是 x32dbg，效果是一样的。

打开 x32dbg.exe，打开微信扫码登录，附加微信进程，此时微信处于假死状态，暂时不要使用。

![ ](/images/other/revoke-wechart-msg-patcher-01.gif)

点击菜单栏下面 Symbols 按钮，搜索 "WeChatWin"，找到 WeChatWin.dll，双击进入

![ ](/images/other/revoke-wechart-msg-patcher-02.png)

在当前界面右键，搜索，当前区域，字符串，输入 "revokemsg" 搜索，然后找到第一个字符串为 "revokemsg" 的命令双击进入跳转到二进制程序

![ ](/images/other/revoke-wechart-msg-patcher-03.png)
![ ](/images/other/revoke-wechart-msg-patcher-04.png)

分析发现进入防撤回前有一个 je 跳转语句，满足撤回条件就进入到撤回流程，不满足就跳转到别的地方，直接将这里修改成无条件跳转到别的不撤回的地方，就实现了防撤回功能。进入 revokemsg 二进制界面后，找到它的前的一个命令，是一个 je 开头的命令，双击将其修改为 jmp。

![ ](/images/other/revoke-wechart-msg-patcher-05.gif)

此时整个补丁已经修改完成，右键点击"Patches"，另存为新的 WeChatWin.dll，关掉 x32dbg 和微信，将新的 WeChatWin.dll 覆盖微信安装目录下即可。

![ ](/images/other/revoke-wechart-msg-patcher-06.gif)

现在重新打开微信，扫码登陆，然后用手机给自己发几条消息然后撤回一下试试看，如果手机上消息显示撤回，电脑上消息还在，那就说明成功了。这么简单还不去试试？
