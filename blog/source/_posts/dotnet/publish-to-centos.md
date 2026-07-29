---
title: 基于.NET Core开发的个人博客 发布至CentOS小计
author: 阿星𝑷𝒍𝒖𝒔
date: 2019-08-15 13:12:15
categories: .NET
tags:
  - .NET Core
  - Linux
  - Nginx
  - Supervisor
  - crontab
---

早些时候，使用 .NET Framework 开发网站，只能部署在 Windows 服务器上面，近两年 .NET Core 如火如荼，乘此机会赶紧上车，最近将自己利用 .NET Core 开发的个人博客发布在了 CentOS 上，简单记录一下使用过程和一些常用的命令，以备不时之需。

## 渣渣服务器配置信息

- 操作系统 CentOS 7.6 64 位
- CPU 1 核
- 内存 1 GB
- 公网带宽 1 Mbps

## 强大的管理工具

- Xshell：强大的安全终端模拟软件，它支持 SSH1, SSH2, 以及 Microsoft Windows 平台的 TELNET 协议。
- WinSCP：WinSCP 是一个 Windows 环境下使用的 SSH 的开源图形化 SFTP 客户端。同时支持 SCP 协议。它的主要功能是在本地与远程计算机间安全地复制文件，并且可以直接编辑文件
- Xftp：Xftp 是一个功能强大的 SFTP、FTP 文件传输软件。使用了 Xftp 以后，MS Windows 用户能安全地在 UNIX/Linux 和 Windows PC 之间传输文件。

## 安装 .NET Core SDK

```shell
sudo rpm -Uvh https://packages.microsoft.com/config/rhel/7/packages-microsoft-prod.rpm

sudo yum update
sudo yum install dotnet-sdk-2.2

dotnet --info
```

## 安装 Nginx

```shell
curl -o  nginx.rpm http://nginx.org/packages/centos/7/noarch/RPMS/nginx-release-centos-7-0.el7.ngx.noarch.rpm

rpm -ivh nginx.rpm

yum install nginx

systemctl start nginx #启动nginx
systemctl enable nginx #设置nginx的开机启动
```

## Nginx 配置

```shell
server {
    listen 443 ssl;
    server_name meowv.com;
    ssl_certificate ssl/1_meowv.com_bundle.crt;
    ssl_certificate_key ssl/2_meowv.com.key;
    ssl_session_timeout 5m;
    ssl_protocols TLSv1 TLSv1.1 TLSv1.2;
    ssl_ciphers AESGCM:ALL:!DH:!EXPORT:!RC4:+HIGH:!MEDIUM:!LOW:!aNULL:!eNULL;
    ssl_prefer_server_ciphers on;
    # error_page 403 https://meowv.com;
    location / {
        # add_header Access-Control-Allow-Origin *;
        # root   /qix/static;
        proxy_pass http://localhost:5000;
        proxy_set_header   X-Real-IP        $remote_addr;
        proxy_set_header   Host             $host;
        proxy_set_header   X-Forwarded-For  $proxy_add_x_forwarded_for;
    }
}

server {
    listen 80;
    server_name meowv.com;
    rewrite ^(.*)$ https://meowv.com;
}
```

## 安装 Supervisor 守护进程

```shell
yum install python-setuptools

easy_install supervisor

mkdir /etc/supervisor
echo_supervisord_conf > /etc/supervisor/supervisord.conf
```

## 配置 Supervisor

找到文件 /etc/supervisor/supervisord.conf 去掉文件最后的注释并修改为

```shell
[include]
files = conf.d/*.ini
```

在 /etc/supervisor/ 下新建文件夹 conf.d，conf.d 文件夹下新建 meowv.conf 文件，内容为

```shell
[program:meowv] #meowv为程序名称
command=dotnet MeowvBlog.Web.dll #执行的命令
directory=/qix/meowv # 命令执行的目录
environment=ASPNETCORE__ENVIRONMENT=Production #环境变量
user=root #用户
stopsignal=INT
autostart=true #是否自启动
autorestart=true #是否自动重启
startsecs=3 #自动重启时间间隔（s）
stderr_logfile=/var/log/meowv.com.err.log #错误日志文件
stdout_logfile=/var/log/meowv.com.out.log #输出日志文件
```

## 利用 crontab 定时执行 Python 爬虫任务

在 Windows 平台我们可以使用任务计划程序运行定时任务，那么在 Linux 下有 crontab 帮我们实现

可以用`crontab -e`命令来编辑`/var/spool/cron`下对应用户的`cron`文件，也可以直接编辑`/etc/crontab`

```shell
# Example of job definition:
# .---------------- minute (0 - 59)
# |  .------------- hour (0 - 23)
# |  |  .---------- day of month (1 - 31)
# |  |  |  .------- month (1 - 12) OR jan,feb,mar,apr ...
# |  |  |  |  .---- day of week (0 - 6) (Sunday=0 or 7) OR sun,mon,tue,wed,thu,fri,sat
# |  |  |  |  |
*/30 * * * * /bin/python /qix/spider/spider.py #每30分钟执行一次
```

```shell
systemctl start  crond.service #启动
systemctl status  crond.service #查看状态
systemctl stop  crond.service #停止
systemctl restart  crond.service #重新启动
systemctl reload  crond.service #重新加载
```

## 常用命令

```shell
cd                 #目录跳转
cd /               #回到上一个目录
ls                 #查看目录下的文件
df -h              #查看文件使用情况
mkdir              #创建文件夹文件夹
vi                 # 编辑文件
:wq!               #保存文件，并退出vi
ifconfig -a        #查看ip
free               #查看系统资源使用情况
reboot             # 重启系统
nginx -s reload    # 刷新nginx配置使其生效
supervisorctl start program_name   #启动某个进程(program_name=配置的进程名称)
supervisorctl stop program_name    #停止某一进程
supervisorctl reload               #重新启动配置中的所有程序
supervisorctl stop all             #停止全部进程
supervisorctl update               #更新新的配置到supervisord
supervisorctl restart program_name #重启某一进程
supervisorctl                      #查看正在守候的进程
```
