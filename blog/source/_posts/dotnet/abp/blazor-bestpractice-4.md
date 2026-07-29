---
title: Blazor 实战系列（四）
author: 阿星𝑷𝒍𝒖𝒔
date: 2020-06-12 08:57:12
categories: Blazor
tags:
  - .NET Core
  - abp vNext
  - Blazor
---

上一篇完成了博客的分页查询文章列表页面的数据绑定和分页功能，本篇将继续完成剩下的几个页面。

在开始主题之前重新解决上一篇的最后一个问题，当点击了头部组件的`/posts`链接时直接强制刷新了页面，经过查看文档和实践有了更好的解决方案。

先将头部组件`Header.razor`中的`NavLink`恢复成`<NavLink class="menu-item" href="posts">Posts</NavLink>`，不需要点击事件了。

然后在`Posts.razor`中添加生命周期函数`OnParametersSetAsync()`，在初始化完成后执行。

```csharp
/// <summary>
/// 初始化完成后执行
/// </summary>
/// <returns></returns>
protected override async Task OnParametersSetAsync()
{
    if (!page.HasValue)
    {
        page = 1;
        await RenderPage(page);
    }
}
```

判断当前 page 参数是否有值，有值的话说明请求肯定是来自于翻页，当 page 没有值的时候就说明是头部的菜单点进来的。那么此时给 page 赋值为 1，调用 API 加载数据即可。

## 分类列表

`Categories.razor`是分类列表页面，上篇文章已经实现了从 API 获取数据的方法，所以这里就很简单了，指定接受类型，然后在生命周期初始化`OnInitializedAsync()`中去获取数据。

```csharp
@code{
    /// <summary>
    /// categories
    /// </summary>
    private ServiceResult<IEnumerable<QueryCategoryDto>> categories;

    /// <summary>
    /// 初始化
    /// </summary>
    protected override async Task OnInitializedAsync()
    {
        // 获取数据
        categories = await Http.GetFromJsonAsync<ServiceResult<IEnumerable<QueryCategoryDto>>>($"/blog/categories");
    }
}
```

当获取到数据的时候进行绑定，没有数据的时候还是显示加载中的组件`<Loading />`让他转圈圈。

```html
@if (categories == null) {
<Loading />
} else {
<div class="container">
  <div class="post-wrap categories">
    <h2 class="post-title">-&nbsp;Categories&nbsp;-</h2>
    <div class="categories-card">
      @if (categories.Success && categories.Result.Any()) { @foreach (var item
      in categories.Result) {
      <div class="card-item">
        <div class="categories">
          <a href="/category/@item.DisplayName/">
            <h3>
              <i class="iconfont iconcode" style="padding-right:3px"></i>
              @item.CategoryName
            </h3>
            <small>(@item.Count)</small>
          </a>
        </div>
      </div>
      } } else {
      <ErrorTip />
      }
    </div>
  </div>
</div>
}
```

直接循环返回的数据列表`categories.Result`，绑定数据就好，当获取失败或者没有返回数据的时候显示错误提示组件`<ErrorTip />`

![ ](/images/abp/blazor-bestpractice-4-01.png)

## 标签列表

`Categories.razor`是标签列表页面，和分类列表 HTML 结构差不多一样的，除了返回类型和接口地址不一样，将上面代码复制过来改改即可。

```csharp
@code{
    /// <summary>
    /// tags
    /// </summary>
    private ServiceResult<IEnumerable<QueryTagDto>> tags;

    /// <summary>
    /// 初始化
    /// </summary>
    protected override async Task OnInitializedAsync()
    {
        // 获取数据
        tags = await Http.GetFromJsonAsync<ServiceResult<IEnumerable<QueryTagDto>>>($"/blog/tags");
    }
}
```

```html
@if (tags == null) {
<Loading />
} else {
<div class="container">
  <div class="post-wrap tags">
    <h2 class="post-title">-&nbsp;Tags&nbsp;-</h2>
    <div class="tag-cloud-tags">
      @if (tags.Success && tags.Result.Any()) { @foreach (var item in
      tags.Result) {
      <a href="/tag/@item.DisplayName/"
        >@item.TagName<small>(@item.Count)</small></a
      >
      } } else {
      <ErrorTip />
      }
    </div>
  </div>
</div>
}
```

![ ](/images/abp/blazor-bestpractice-4-02.png)

## 友链列表

`FriendLinks.razor`是友情链接列表页面，实现方式和上面两个套路一模一样。

```csharp
@code {
    /// <summary>
    /// friendlinks
    /// </summary>
    private ServiceResult<IEnumerable<FriendLinkDto>> friendlinks;

    /// <summary>
    /// 初始化
    /// </summary>
    protected override async Task OnInitializedAsync()
    {
        // 获取数据
        friendlinks = await Http.GetFromJsonAsync<ServiceResult<IEnumerable<FriendLinkDto>>>($"/blog/friendlinks");
    }
}
```

```html
@if (friendlinks == null) {
<Loading />
} else {
<div class="container">
  <div class="post-wrap categories">
    <h2 class="post-title">-&nbsp;FriendLinks&nbsp;-</h2>
    <div class="categories-card">
      @if (friendlinks.Success && friendlinks.Result.Any()) { @foreach (var item
      in friendlinks.Result) {
      <div class="card-item">
        <div class="categories">
          <a target="_blank" href="@item.LinkUrl">
            <h3>@item.Title</h3>
          </a>
        </div>
      </div>
      } } else {
      <ErrorTip />
      }
    </div>
  </div>
</div>
}
```

![ ](/images/abp/blazor-bestpractice-4-03.png)

## 文章列表(分类)

`Posts.Category.razor`是根据分类查询文章列表页面，他接受一个参数 name，我们要根据 name 去 API 查询数据然后绑定页面即可。

这里的参数 name 实际上就是从标签列表传递过来的`DisplayName`的值，它是一个比较友好的名称，我们还要通过这个值去查询真正的分类名称进行展示，所以这里需要调用两个 API，这点在设计 API 的时候没有考虑好，我们其实可以将这两个 API 合并变成一个，后续再进行优化吧，这里就请求两次。

添加两个接收参数：分类名称和返回的文章列表数据。

```csharp
/// <summary>
/// 分类名称
/// </summary>
private string categoryName;

/// <summary>
/// 文章列表数据
/// </summary>
private ServiceResult<IEnumerable<QueryPostDto>> posts;
```

然后在`OnInitializedAsync()`初始化方法中调用 API 获取数据，赋值给变量。

```csharp
/// <summary>
/// 初始化
/// </summary>
protected override async Task OnInitializedAsync()
{
    // TODO:获取数据,可以在API中合并这两个请求。
    var category = await Http.GetFromJsonAsync<ServiceResult<string>>($"/blog/category?name={name}");
    posts = await Http.GetFromJsonAsync<ServiceResult<IEnumerable<QueryPostDto>>>($"/blog/posts/category?name={name}");

    if (category.Success)
    {
        categoryName = category.Result;
    }
}
```

有了数据，直接在页面上进行循环绑定。

```html
@if (posts == null)
{
    <Loading />
}
else
{
    <div class="container">
        <div class="post-wrap tags">
            @if (categoryName != null)
            {
                <h2 class="post-title">-&nbsp;Category&nbsp;·&nbsp;@categoryName&nbsp;-</h2>
            }
        </div>
        <div class="post-wrap archive">
            @if (posts.Success && posts.Result.Any())
            {
                @foreach (var item in posts.Result)
                {
                    <h3>@item.Year</h3>
                    @foreach (var post in item.Posts)
                    {
                        <article class="archive-item">
                            <NavLink href="@("/post"+post.Url)">@post.Title</NavLink>
                            <span class="archive-item-date">@post.CreationTime</span>
                        </article>
                    }
                }
            }
            else
            {
                <ErrorTip />
            }
        </div>
    </div>
}
```

![ ](/images/abp/blazor-bestpractice-4-04.gif)

## 文章列表(标签)

`Posts.Tag.razor`是根据标签查询文章列表，这个和分类查询文章列表实现方式一样，直接上代码。

```csharp
@code {
    /// <summary>
    /// 标签名称参数
    /// </summary>
    [Parameter]
    public string name { get; set; }

    /// <summary>
    /// 标签名称
    /// </summary>
    private string tagName;

    /// <summary>
    /// 文章列表数据
    /// </summary>
    private ServiceResult<IEnumerable<QueryPostDto>> posts;

    /// <summary>
    /// 初始化
    /// </summary>
    protected override async Task OnInitializedAsync()
    {
        // TODO:获取数据,可以在API中合并这两个请求。
        var tag = await Http.GetFromJsonAsync<ServiceResult<string>>($"/blog/tag?name={name}");
        posts = await Http.GetFromJsonAsync<ServiceResult<IEnumerable<QueryPostDto>>>($"/blog/posts/tag?name={name}");

        if (tag.Success)
        {
            tagName = tag.Result;
        }
    }
}
```

```html
@if (posts == null)
{
    <Loading />
}
else
{
    <div class="container">
        <div class="post-wrap tags">
            @if (tagName != null)
            {
                <h2 class="post-title">-&nbsp;Tag&nbsp;·&nbsp;@tagName&nbsp;-</h2>
            }
        </div>
        <div class="post-wrap archive">
            @if (posts.Success && posts.Result.Any())
            {
                @foreach (var item in posts.Result)
                {
                    <h3>@item.Year</h3>
                    @foreach (var post in item.Posts)
                    {
                        <article class="archive-item">
                            <NavLink href="@("/post"+post.Url)">@post.Title</NavLink>
                            <span class="archive-item-date">@post.CreationTime</span>
                        </article>
                    }
                }
            }
            else
            {
                <ErrorTip />
            }
        </div>
    </div>
}
```

![ ](/images/abp/blazor-bestpractice-4-05.gif)

以上完成了以上几个页面的数据绑定，页面之间的跳转已经关联起来了，然后还剩下文章详情页，大家可以先自己动手完成它，今天就到这里，未完待续...
