---
title: Blazor 实战系列（二）
author: 阿星𝑷𝒍𝒖𝒔
date: 2020-06-10 08:58:10
categories: Blazor
tags:
  - .NET Core
  - abp vNext
  - Blazor
---

上一篇搭建了 Blazor 项目并将整体框架改造了一下，本篇将完成用 C# 代码代替 JavaScript 实现几个小功能，说是代替但并不能完全不用 JavaScript，应该说是尽量不用吧。

## 二维码显示与隐藏

![ ](/images/abp/blazor-bestpractice-2-01.gif)

可以看到，当我鼠标移入的时候显示二维码，移出的时候隐藏二维码。

这个功能如果是用 JavaScript 来完成的话，肯定首先想到的是 HTML 的 Mouse 事件属性，那么在 Blazor 中也是一样的，给我们实现了各种`on*`事件。

打开`index.razor`页面，给微信图标那个 NavLink 标签添加两个事件，`@onmouseover`和`@onmouseout`。

```html
...
<NavLink
  class="link-item weixin"
  title="扫码关注微信公众号：『阿星Plus』查看更多。"
  @onmouseover="Hover"
  @onmouseout="Hover"
>
  <i class="iconfont iconweixin"></i>
</NavLink>
...
```

当鼠标移入移出的时候都执行我们自定义的一个方法`Hover()`。

C# 代码写在`@code{}`花括号中，实现显示和隐藏原理是利用 css，默认是隐藏的，当显示的时候将具有隐藏属性的 class 值去掉就可以了。

所以，可以添加两个字段，一个用于判断当前是否处于隐藏状态，一个用来存储 class 的值。

```csharp
/// <summary>
/// 是否隐藏
/// </summary>
private bool IsHidden = true;

/// <summary>
/// 二维码CSS
/// </summary>
private string QrCodeCssClass => IsHidden ? "hidden" : null;
```

当`IsHidden = true`，`QrCodeCssClass = "hidden"`，当`IsHidden = false`，`QrCodeCssClass = null`。

那么在`Hover()`方法中，不断修改`IsHidden`的值就可以实现效果了。

```csharp
/// <summary>
/// 鼠标移入移出操作
/// </summary>
private void Hover() => IsHidden = !IsHidden;
```

最后将`QrCodeCssClass`变量赋值给二维码图片所在的 div 上。

```html
...
<div class="qrcode @QrCodeCssClass">
  <img src="https://static.meowv.com/images/wx_qrcode.jpg" />
</div>
...
```

大功告成，`index.razor`完整代码如下：

```html
@page "/"

<div class="main">
  <div class="container">
    <div class="intro">
      <div class="avatar">
        <a href="javascript:;"
          ><img src="https://static.meowv.com/images/avatar.jpg"
        /></a>
      </div>
      <div class="nickname">阿星Plus</div>
      <div class="description">
        <p>
          生命不息，奋斗不止
          <br />Cease to struggle and you cease to live
        </p>
      </div>
      <div class="links">
        <NavLink class="link-item" title="Posts" href="posts">
          <i class="iconfont iconread"></i>
        </NavLink>
        <NavLink
          target="_blank"
          class="link-item"
          title="Notes"
          href="https://notes.meowv.com/"
        >
          <i class="iconfont iconnotes"></i>
        </NavLink>
        <NavLink
          target="_blank"
          class="link-item"
          title="API"
          href="https://api.meowv.com/"
        >
          <i class="iconfont iconapi"></i>
        </NavLink>
        <NavLink class="link-item" title="Manage" href="/account/auth">
          <i class="iconfont iconcode"></i>
        </NavLink>
        <NavLink
          target="_blank"
          class="link-item"
          title="Github"
          href="https://github.com/Meowv/"
        >
          <i class="iconfont icongithub"></i>
        </NavLink>
        <NavLink
          class="link-item weixin"
          title="扫码关注微信公众号：『阿星Plus』查看更多。"
          @onmouseover="Hover"
          @onmouseout="Hover"
        >
          <i class="iconfont iconweixin"></i>
        </NavLink>
        <div class="qrcode @QrCodeCssClass">
          <img src="https://static.meowv.com/images/wx_qrcode.jpg" />
        </div>
      </div>
    </div>
  </div>
</div>

@code { ///
<summary>/// 是否隐藏 ///</summary>
private bool IsHidden = true; ///
<summary>/// 二维码CSS ///</summary>
private string QrCodeCssClass => IsHidden ? "hidden" : null; ///
<summary>/// 鼠标移入移出操作 ///</summary>
private void Hover() => IsHidden = !IsHidden; }
```

## 菜单显示与隐藏

![ ](/images/abp/blazor-bestpractice-2-02.gif)

菜单是在小屏幕上才会出现的，相信看完了二维码的显示与隐藏，这个菜单的显示与隐藏就好办了吧，实现方法是一样的，菜单按钮是在头部组件`Header.razor`中的，包括主题切换功能，所以下面代码都在`Header.razor`里面。

```csharp
@code {
    /// <summary>
    /// 下拉菜单是否打开
    /// </summary>
    private bool collapseNavMenu = false;

    /// <summary>
    /// 导航菜单CSS
    /// </summary>
    private string NavMenuCssClass => collapseNavMenu ? "active" : null;

    /// <summary>
    /// 显示/隐藏 菜单
    /// </summary>
    private void ToggleNavMenu() => collapseNavMenu = !collapseNavMenu;
}
```

默认是不打开的，`collapseNavMenu = false`。然后根据`collapseNavMenu`值为`NavMenuCssClass`给定不同的 class。

```html
...
<nav class="navbar-mobile">
  <div class="container">
    <div class="navbar-header">
      <div>
        <NavLink class="menu-item" href="" Match="NavLinkMatch.All"
          >😍阿星Plus</NavLink
        >
        <NavLink>&nbsp;·&nbsp;Light</NavLink>
      </div>
      <div class="menu-toggle" @onclick="ToggleNavMenu">&#9776; Menu</div>
    </div>
    <div class="menu @NavMenuCssClass">
      <NavLink class="menu-item" href="posts">Posts</NavLink>
      <NavLink class="menu-item" href="categories">Categories</NavLink>
      <NavLink class="menu-item" href="tags">Tags</NavLink>
      <NavLink class="menu-item apps" href="apps">Apps</NavLink>
    </div>
  </div>
</nav>
...
```

与二维码显示与隐藏唯一区别就是这里是点击按钮，不是移入移出，所以菜单显示与隐藏需要用到`@onclick`方法。

## 主题切换

![ ](/images/abp/blazor-bestpractice-2-03.gif)

哇，这个主题切换真的是一言难尽，当切换主题的时候需要记住当前的主题是什么，当刷新页面或者跳转其他页面的时候，主题状态是需要一致的，默认是白色主题，当切换暗黑色主题后其实是在 body 上加了一个 class。

在 Blazor 实在是不知道用什么办法去动态控制 body 的样式，所以这里我想到了一个办法，写几个全局的 JavaScript 方法，然后再 Blazor 中调用，要知道，他们是可以互相调用的，于是问题迎刃而解。

添加`app.js`文件，放在 /wwwroot/js/ 下面。

```javascript
var func = window.func || {};

func = {
  setStorage: function (name, value) {
    localStorage.setItem(name, value);
  },
  getStorage: function (name) {
    return localStorage.getItem(name);
  },
  switchTheme: function () {
    var currentTheme = this.getStorage("theme") || "Light";
    var isDark = currentTheme === "Dark";

    if (isDark) {
      document.querySelector("body").classList.add("dark-theme");
    } else {
      document.querySelector("body").classList.remove("dark-theme");
    }
  },
};
```

这里写了三个方法，设置 localStorage：`setStorage(name,value)`，获取 localStorage：`getStorage(name)`，切换主题：`switchTheme()`，localStorage 是浏览器以 name:value 形式的本地存储对象。

`switchTheme`主要做的事情就是，判断当前主题如果是暗黑，就给 body 加上对应的 class，如果不是就去掉。

然后在 index.html 中引用。

```html
...
<body>
  <app>
    <div class="loader"></div>
  </app>
  <script src="js/app.js"></script>
  <script src="_framework/blazor.webassembly.js"></script>
</body>
...
```

有了这个三个全局的 JavaScript 方法，切换主题就变得简单多了，看代码。

```csharp
...
/// <summary>
/// 当前主题
/// </summary>
private string currentTheme;

/// <summary>
/// 初始化
/// </summary>
/// <returns></returns>
protected override async Task OnInitializedAsync()
{
    currentTheme = await JSRuntime.InvokeAsync<string>("window.func.getStorage", "theme") ?? "Light";

    await JSRuntime.InvokeVoidAsync("window.func.switchTheme");
}
...
```

注意在 Blazor 调用 JavaScript 方法需要注入`IJSRuntime`接口，`@inject IJSRuntime JSRuntime`。

新建一个变量`currentTheme`，在生命周期函数初始化的时候去调用 JavaScript 中的`getStorage`方法，获取当前主题，考虑到第一次访问的情况，可以给一个默认值为 Light，表示白色主题，然后再去调用 switchTheme，执行切换主题的方法。这样页面就会根据`localStorage`的值来确定当前的主题。

```csharp
...
/// <summary>
/// 切换主题
/// </summary>
private async Task SwitchTheme()
{
    currentTheme = currentTheme == "Light" ? "Dark" : "Light";

    await JSRuntime.InvokeVoidAsync("window.func.setStorage", "theme", currentTheme);

    await JSRuntime.InvokeVoidAsync("window.func.switchTheme");
}
...
```

`SwitchTheme()`是切换主题的方法，当我们点击 input 按钮时可以任意切换，并且主题还要实时跟着变化。

当点击按钮执行`SwitchTheme()`时候改变`currentTheme`的值，然后将`currentTheme`传递给 JavaScript 方法`setStorage`，最后再次执行切换主题的 JavaScript 方法即可。

此时变量`currentTheme`也发挥了不少作用，在小屏幕下会显示当前主题的名称，Dark or Light，可以直接将`currentTheme`在 HTML 中赋值即可。

并且我们 input 是 checkbox 类型，当是黑色主题的时候需要时选中的状态，白色主题的时候不选中，这里就可以利用 checked 属性这样写：`checked="@(currentTheme == "Dark")"`。

```html
<nav class="navbar">
  <div class="container">
    ...
    <div class="menu navbar-right">
      ... <input id="switch_default" type="checkbox" class="switch_default"
      @onchange="SwitchTheme" checked="@(currentTheme == "Dark")" />
      <label for="switch_default" class="toggleBtn"></label>
    </div>
  </div>
</nav>
<nav class="navbar">
  <div class="container">
    ...
    <div class="menu navbar-right">
      ... <input id="switch_default" type="checkbox" class="switch_default"
      @onchange="SwitchTheme" checked="@(currentTheme == "Dark")" />
      <label for="switch_default" class="toggleBtn"></label>
    </div>
  </div>
</nav>
<nav class="navbar-mobile">
  <div class="container">
    <div class="navbar-header">
      <div>
        <NavLink class="menu-item" href="" Match="NavLinkMatch.All"
          >😍阿星Plus</NavLink
        >
        <NavLink @onclick="SwitchTheme">&nbsp;·&nbsp;@currentTheme</NavLink>
      </div>
      <div class="menu-toggle" @onclick="ToggleNavMenu">&#9776; Menu</div>
    </div>
    <div class="menu @NavMenuCssClass">...</div>
  </div>
</nav>
```

OK，搞定，快去试试吧。

## 优化代码

现在看起来乱乱的，并且设置获取`localStorage`属于公共的方法，说不定以后也能用到，我们将其封装一下，便于日后的调用，不然要写好多重复的代码。

在 Blazor 项目根目录添加文件夹 Commons，在文件夹下添加一个`Common.cs`，目前用到了`IJSRuntime`，用构造函数注入，然后写几个公共的方法。

```csharp
//Common.cs
using Microsoft.JSInterop;
using System.Threading.Tasks;

namespace Meowv.Blog.BlazorApp.Commons
{
    public class Common
    {
        private readonly IJSRuntime _jsRuntime;

        public Common(IJSRuntime jsRuntime)
        {
            _jsRuntime = jsRuntime;
        }

        /// <summary>
        /// 执行无返回值方法
        /// </summary>
        /// <param name="identifier"></param>
        /// <param name="args"></param>
        /// <returns></returns>
        public async ValueTask InvokeAsync(string identifier, params object[] args)
        {
            await _jsRuntime.InvokeVoidAsync(identifier, args);
        }

        /// <summary>
        /// 执行带返回值的方法
        /// </summary>
        /// <typeparam name="TValue"></typeparam>
        /// <param name="identifier"></param>
        /// <param name="args"></param>
        /// <returns></returns>
        public async ValueTask<TValue> InvokeAsync<TValue>(string identifier, params object[] args)
        {
            return await _jsRuntime.InvokeAsync<TValue>(identifier, args);
        }

        /// <summary>
        /// 设置localStorage
        /// </summary>
        /// <param name="name"></param>
        /// <param name="value"></param>
        /// <returns></returns>
        public async Task SetStorageAsync(string name, string value)
        {
            await InvokeAsync("window.func.setStorage", name, value);
        }

        /// <summary>
        /// 获取localStorage
        /// </summary>
        /// <param name="name"></param>
        /// <returns></returns>
        public async Task<string> GetStorageAsync(string name)
        {
            return await InvokeAsync<string>("window.func.getStorage", name);
        }
    }
}
```

然后需要在`Program.cs`中注入。

```csharp
using Meowv.Blog.BlazorApp.Commons;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using Microsoft.Extensions.DependencyInjection;
using System;
using System.Net.Http;
using System.Threading.Tasks;

namespace Meowv.Blog.BlazorApp
{
    public class Program
    {
        public static async Task Main(string[] args)
        {
            var builder = WebAssemblyHostBuilder.CreateDefault(args);
            builder.RootComponents.Add<App>("app");

            builder.Services.AddTransient(sp => new HttpClient { BaseAddress = new Uri(builder.HostEnvironment.BaseAddress) });

            builder.Services.AddSingleton(typeof(Common));

            await builder.Build().RunAsync();
        }
    }
}
```

紧接着在`_Imports.razor`中注入使用`Common`，`@inject Commons.Common Common`。

改造一下`Header.razor`，全部代码如下：

```csharp
<header>
    <nav class="navbar">
        <div class="container">
            <div class="navbar-header header-logo">
                <NavLink class="menu-item" href="/" Match="NavLinkMatch.All">
                    😍阿星Plus
                </NavLink>
            </div>
            <div class="menu navbar-right">
                <NavLink class="menu-item" href="posts">Posts</NavLink>
                <NavLink class="menu-item" href="categories">Categories</NavLink>
                <NavLink class="menu-item" href="tags">Tags</NavLink>
                <NavLink class="menu-item apps" href="apps">Apps</NavLink>
                <input id="switch_default" type="checkbox" class="switch_default" @onchange="SwitchTheme" checked="@(currentTheme == "Dark")" />
                <label for="switch_default" class="toggleBtn"></label>
            </div>
        </div>
    </nav>
    <nav class="navbar-mobile">
        <div class="container">
            <div class="navbar-header">
                <div>
                    <NavLink class="menu-item" href="" Match="NavLinkMatch.All">😍阿星Plus</NavLink>
                    <NavLink @onclick="SwitchTheme">&nbsp;·&nbsp;@currentTheme</NavLink>
                </div>
                <div class="menu-toggle" @onclick="ToggleNavMenu">&#9776; Menu</div>
            </div>
            <div class="menu @NavMenuCssClass">
                <NavLink class="menu-item" href="posts">Posts</NavLink>
                <NavLink class="menu-item" href="categories">Categories</NavLink>
                <NavLink class="menu-item" href="tags">Tags</NavLink>
                <NavLink class="menu-item apps" href="apps">Apps</NavLink>
            </div>
        </div>
    </nav>
</header>

@code {
    /// <summary>
    /// 下拉菜单是否打开
    /// </summary>
    private bool collapseNavMenu = false;

    /// <summary>
    /// 导航菜单CSS
    /// </summary>
    private string NavMenuCssClass => collapseNavMenu ? "active" : null;

    /// <summary>
    /// 显示/隐藏 菜单
    /// </summary>
    private void ToggleNavMenu() => collapseNavMenu = !collapseNavMenu;

    /// <summary>
    /// 当前主题
    /// </summary>
    private string currentTheme;

    /// <summary>
    /// 初始化
    /// </summary>
    /// <returns></returns>
    protected override async Task OnInitializedAsync()
    {
        currentTheme = await Common.GetStorageAsync("theme") ?? "Light";

        await Common.InvokeAsync("window.func.switchTheme");
    }

    /// <summary>
    /// 切换主题
    /// </summary>
    private async Task SwitchTheme()
    {
        currentTheme = currentTheme == "Light" ? "Dark" : "Light";

        await Common.SetStorageAsync("theme", currentTheme);

        await Common.InvokeAsync("window.func.switchTheme");
    }
}
```

实现过程比较简单，相信你绝对学会了。本篇就到这里了，未完待续...
