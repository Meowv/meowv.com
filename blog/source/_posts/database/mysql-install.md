---
title: Windows下MySQL安装流程，8.0以上版本ROOT密码报错及修改
author: 阿星𝑷𝒍𝒖𝒔
date: 2019-07-29 22:28:29
categories: Database
tags:
  - MySQL
---

官网下载 MySQL 安装后，解压，添加环境变量，以管理员方式运行 cmd，运行以下命令

```shell
mysqld --initialize --console
mysqld -install

net start mysql
net stop mysql
```

以上命令走完，确保 MySQL 安装和启动没问题，第一次安装设置密码\(忘记密码也适用\)

运行：`mysqld --shared-memory --skip-grant-tables`

此时命令提示符窗口处于锁定状态，我们重新以管理员方式运行新的 cmd，运行以下命令

```shell
mysql -uroot -p
```

提示输入密码时直接按回车进入，输入

```shell
use mysql;
alter user 'root'@'localhost' identified by '123456';
flush privileges;
```

123456 就是要设置的密码，退出 MySQL 交互环境，再次启动 MySQL 服务，用设置的密码连接 MySQL
