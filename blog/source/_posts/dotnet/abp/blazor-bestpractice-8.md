---
title: Blazor 实战系列（八）
author: 阿星𝑷𝒍𝒖𝒔
date: 2020-06-17 08:54:17
categories: Blazor
tags:
  - .NET Core
  - abp vNext
  - Blazor
---

上一篇完成了标签模块和友情链接模块的所有功能，本篇来继续完成博客最后的模块，文章的管理。

## 文章列表 & 删除

![ ](/images/abp/blazor-bestpractice-8-01.png)

先将分页查询的列表给整出来，这块和首页的分页列表是类似的，就是多了个 Id 字段。

先添加两条路由规则。

```csharp
@page "/admin/posts"
@page "/admin/posts/{page:int}"
```

新建返回数据默认`QueryPostForAdminDto.cs`。

```csharp
//QueryPostForAdminDto.cs
using System.Collections.Generic;

namespace Meowv.Blog.BlazorApp.Response.Blog
{
    public class QueryPostForAdminDto
    {
        /// <summary>
        /// 年份
        /// </summary>
        public int Year { get; set; }

        /// <summary>
        /// Posts
        /// </summary>
        public IEnumerable<PostBriefForAdminDto> Posts { get; set; }
    }
}

//PostBriefForAdminDto.cs
namespace Meowv.Blog.BlazorApp.Response.Blog
{
    public class PostBriefForAdminDto : PostBriefDto
    {
        /// <summary>
        /// 主键
        /// </summary>
        public int Id { get; set; }
    }
}
```

然后添加所需的参数：当前页码、限制条数、总页码、文章列表返回数据模型。

```csharp
/// <summary>
/// 当前页码
/// </summary>
[Parameter]
public int? page { get; set; }

/// <summary>
/// 限制条数
/// </summary>
private int Limit = 15;

/// <summary>
/// 总页码
/// </summary>
private int TotalPage;

/// <summary>
/// 文章列表数据
/// </summary>
private ServiceResult<PagedList<QueryPostForAdminDto>> posts;
```

然后在初始化函数`OnInitializedAsync()`中调用 API 获取文章数据.

```csharp
/// <summary>
/// 初始化
/// </summary>
protected override async Task OnInitializedAsync()
{
    var token = await Common.GetStorageAsync("token");
    Http.DefaultRequestHeaders.Add("Authorization", $"Bearer {token}");

    // 设置默认值
    page = page.HasValue ? page : 1;

    await RenderPage(page);
}

/// <summary>
/// 点击页码重新渲染数据
/// </summary>
/// <param name="page"></param>
/// <returns></returns>
private async Task RenderPage(int? page)
{
    // 获取数据
    posts = await Http.GetFromJsonAsync<ServiceResult<PagedList<QueryPostForAdminDto>>>($"/blog/admin/posts?page={page}&limit={Limit}");

    // 计算总页码
    TotalPage = (int)Math.Ceiling((posts.Result.Total / (double)Limit));
}
```

在初始化中判断 page 参数，如果没有值给他设置一个默认值 1。`RenderPage(int? page)`方法是调用 API 返回数据，并计算出总页码值。

最后在页面上进行数据绑定。

```html
<AdminLayout>
    @if (posts == null)
    {
        <Loading />
    }
    else
    {
        <div class="post-wrap archive">
            <NavLink style="float:right" href="/admin/post"><h3>📝~~~ 新增文章 ~~~📝</h3></NavLink>
            @if (posts.Success && posts.Result.Item.Any())
            {
                @foreach (var item in posts.Result.Item)
                {
                    <h3>@item.Year</h3>
                    @foreach (var post in item.Posts)
                    {
                        <article class="archive-item">
                            <NavLink title="❌删除" @onclick="@(async () => await DeleteAsync(post.Id))">❌</NavLink>
                            <NavLink title="📝编辑" @onclick="@(async () => await Common.NavigateTo($"/admin/post/{post.Id}"))">📝</NavLink>
                            <NavLink target="_blank" class="archive-item-link" href="@("/post" + post.Url)">@post.Title</NavLink>
                            <span class="archive-item-date">@post.CreationTime</span>
                        </article>
                    }
                }
                <nav class="pagination">
                    @for (int i = 1; i <= TotalPage; i++)
                    {
                        var _page = i;

                        if (page == _page)
                        {
                            <span class="page-number current">@_page</span>
                        }
                        else
                        {
                            <a class="page-number" @onclick="@(() => RenderPage(_page))" href="/admin/posts/@_page">@_page</a>
                        }
                    }
                </nav>
            }
            else
            {
                <ErrorTip />
            }
        </div>
    }
</AdminLayout>
```

HTML 内容放在组件`AdminLayout`中，当 posts 没加载完数据的时候显示加载组件`<Loading />`。

在页面上循环遍历文章数据和翻页页码，每篇文章标题前面添加两个按钮删除和编辑，同时单独加了一个新增文章的按钮。

删除文章调用`DeleteAsync(int id)`方法，需要传递参数，当前文章的 id。

新增和编辑按钮都跳转到"/admin/post"页面，当编辑的时候将 id 也传过去即可，路由规则为："/admin/post/{id}"。

删除文章``方法如下：

```csharp
/// <summary>
/// 删除文章
/// </summary>
/// <param name="id"></param>
/// <returns></returns>
private async Task DeleteAsync(int id)
{
    // 弹窗确认
    bool confirmed = await Common.InvokeAsync<bool>("confirm", "\n💥💢真的要干掉这篇该死的文章吗💢💥");

    if (confirmed)
    {
        var response = await Http.DeleteAsync($"/blog/post?id={id}");

        var result = await response.Content.ReadFromJsonAsync<ServiceResult>();

        if (result.Success)
        {
            await RenderPage(page);
        }
    }
}
```

删除之前进行二次确认，避免误删，当确认删除之后调用删除文章 API，最后重新渲染数据即可。

![ ](/images/abp/blazor-bestpractice-8-02.gif)

## 新增 & 更新文章

完成了后台文章列表的查询和删除，现在整个博客模块功能就差新增和更新文章了，胜利就在前方，冲啊。

这块的开发工作耗费了我太多时间，因为想使用 markdown 来写文章，找了一圈下来没有一个合适的组件，所以退而求次只能选择现有的 markdown 编辑器来实现了。

我这里选择了开源的编辑器`Editor.md`，有需要的可以去 Github 自己下载，<https://github.com/pandao/editor.md> 。

将下载的资源包解压放在 wwwroot 文件夹下，默认是比较大的，而且还有很多示例文件，我已经将其精简了一番，可以去我 Github 下载使用。

先来看下最终的成品效果吧。

![ ](/images/abp/blazor-bestpractice-8-03.png)

是不是感觉还可以，废话不多说，接下里告诉大家如何实现。

在 Admin 文件夹下添加`post.razor`组件，设置路由，并且引用一个样式文件，在页面中引用样式文件好像不太符合标准，不过无所谓了，这个后台就自己用，而且还就这一个页面用得到。

```html
@page "/admin/post" @page "/admin/post/{id:int}"

<link href="./editor.md/css/editormd.css" rel="stylesheet" />

<AdminLayout> ... </AdminLayout>
```

把具体 HTML 内容放在组件`AdminLayout`中。

因为新增和编辑放在同一个页面上，所以当 id 参数不为空的时候需要添加一个 id 参数，同时默认一进来就让页面显示加载中的组件，当页面和数据加载完成后在显示具体的内容，所以在指定一个布尔类型的是否加载参数`isLoading`。

我们的编辑器主要依赖 JavaScript 实现的，所以这里不可避免要使用到 JavaScript 了。

在`app.js`中添加几个全局函数。

```javascript
switchEditorTheme: function () {
    editor.setTheme(localStorage.editorTheme || 'default');
    editor.setEditorTheme(localStorage.editorTheme === 'dark' ? 'pastel-on-dark' : 'default');
    editor.setPreviewTheme(localStorage.editorTheme || 'default');
},
renderEditor: async function () {
    await this._loadScript('./editor.md/lib/zepto.min.js').then(function () {
        func._loadScript('./editor.md/editormd.js').then(function () {
            editor = editormd("editor", {
                width: "100%",
                height: 700,
                path: './editor.md/lib/',
                codeFold: true,
                saveHTMLToTextarea: true,
                emoji: true,
                atLink: false,
                emailLink: false,
                theme: localStorage.editorTheme || 'default',
                editorTheme: localStorage.editorTheme === 'dark' ? 'pastel-on-dark' : 'default',
                previewTheme: localStorage.editorTheme || 'default',
                toolbarIcons: function () {
                    return ["bold", "del", "italic", "quote", "ucwords", "uppercase", "lowercase", "h1", "h2", "h3", "h4", "h5", "h6", "list-ul", "list-ol", "hr", "link", "image", "code", "preformatted-text", "code-block", "table", "datetime", "html-entities", "emoji", "watch", "preview", "fullscreen", "clear", "||", "save"]
                },
                toolbarIconsClass: {
                    save: "fa-check"
                },
                toolbarHandlers: {
                    save: function () {
                        func._shoowBox();
                    }
                },
                onload: function () {
                    this.addKeyMap({
                        "Ctrl-S": function () {
                            func._shoowBox();
                        }
                    });
                }
            });
        });
    });
},
_shoowBox: function () {
    DotNet.invokeMethodAsync('Meowv.Blog.BlazorApp', 'showbox');
},
_loadScript: async function (url) {
    let response = await fetch(url);
    var js = await response.text();
    eval(js);
}
```

`renderEditor`主要实现了动态加载 JavaScript 代码，将 markdown 编辑器渲染出来。这里不多说，都是`Editor.md`示例里面的代码。

为了兼容暗黑色主题，这里还加了一个切换编辑器主题的 JavaScript 方法，`switchEditorTheme`。

`_shoowBox`就厉害了，这个方法是调用的.NET 组件中的方法，前面我们用过了在 Blazor 中调用 JavaScript，这里演示了 JavaScript 中调用 Blazor 中的组件方法。

现在将所需的几个参数都添加到代码中。

```csharp
/// <summary>
/// 定义一个委托方法，用于组件实例方法调用
/// </summary>
private static Func<Task> action;

/// <summary>
/// 默认隐藏Box
/// </summary>
private bool Open { get; set; } = false;

/// <summary>
/// 修改时的文章Id
/// </summary>
[Parameter]
public int? Id { get; set; }

/// <summary>
/// 格式化的标签
/// </summary>
private string tags { get; set; }

/// <summary>
/// 默认显示加载中
/// </summary>
private bool isLoading = true;

/// <summary>
/// 文章新增或者修改输入参数
/// </summary>
private PostForAdminDto input;

/// <summary>
/// API返回的分类列表数据
/// </summary>
private ServiceResult<IEnumerable<QueryCategoryForAdminDto>> categories;
```

大家看看注释就知道参数是做什么的了。

现在我们在初始化函数中将所需的数据通过 API 获取到。

```csharp
/// <summary>
/// 初始化
/// </summary>
/// <returns></returns>
protected override async Task OnInitializedAsync()
{
    action = ChangeOpenStatus;

    var token = await Common.GetStorageAsync("token");
    Http.DefaultRequestHeaders.Add("Authorization", $"Bearer {token}");

    if (Id.HasValue)
    {
        var post = await Http.GetFromJsonAsync<ServiceResult<PostForAdminDto>>($"/blog/admin/post?id={Id}");

        if (post.Success)
        {
            var _post = post.Result;
            input = new PostForAdminDto
            {
                Title = _post.Title,
                Author = _post.Author,
                Url = _post.Url,
                Html = _post.Html,
                Markdown = _post.Markdown,
                CategoryId = _post.CategoryId,
                Tags = _post.Tags,
                CreationTime = _post.CreationTime
            };

            tags = string.Join(",", input.Tags);
        }
    }
    else
    {
        input = new PostForAdminDto()
        {
            Author = "阿星Plus",
            CreationTime = DateTime.Now
        };
    }

    categories = await Http.GetFromJsonAsync<ServiceResult<IEnumerable<QueryCategoryForAdminDto>>>("/blog/admin/categories");

    // 渲染编辑器
    await Common.InvokeAsync("window.func.renderEditor");

    // 关闭加载
    isLoading = !isLoading;
}
```

action 是一个异步的委托，在初始化中执行了`ChangeOpenStatus`方法，这个方法等会说，然后获取`localStorage`中 token 的值。

通过参数 Id 是否有值来判断当前是新增文章还是更新文章，如果有值就是更新文章，这时候需要根据 id 去将文章的数据拿到赋值给`PostForAdminDto`对象展示在页面上，如果没有可以添加几个默认值给`PostForAdminDto`对象。

因为文章需要分类和标签的数据，同时这里将分类的数据也查出来，标签默认是 List 列表，将其转换成字符串类型。

但完成上面操作后，调用 JavaScript 方法`renderEditor`渲染渲染编辑器，最后关闭加载，显示页面。

现在来看看页面。

```html
<AdminLayout>
  @if (isLoading) {
  <Loading />
  } else {
  <div class="post-box">
    <div class="post-box-item">
      <input
        type="text"
        placeholder="标题"
        autocomplete="off"
        @bind="@input.Title"
        @bind:event="oninput"
        @onclick="@(() => { Open = false; })"
      />
      <input
        type="text"
        placeholder="作者"
        autocomplete="off"
        @bind="@input.Author"
        @bind:event="oninput"
        @onclick="@(() => { Open = false; })"
      />
    </div>
    <div class="post-box-item">
      <input
        type="text"
        placeholder="URL"
        autocomplete="off"
        @bind="@input.Url"
        @bind:event="oninput"
        @onclick="@(() => { Open = false; })"
      />
      <input
        type="text"
        placeholder="时间"
        autocomplete="off"
        @bind="@input.CreationTime"
        @bind:format="yyyy-MM-dd HH:mm:sss"
        @bind:event="oninput"
        @onclick="@(() => { Open = false; })"
      />
    </div>
    <div id="editor">
      <textarea style="display:none;">@input.Markdown</textarea>
    </div>

    <Box OnClickCallback="@SubmitAsync" Open="@Open" ButtonText="发布">
      <div class="box-item">
        <b>分类：</b>
        @if (categories.Success && categories.Result.Any()) { @foreach (var item
        in categories.Result) {
        <label
          ><input
            type="radio"
            name="category"
            value="@item.Id"
            @onchange="@(() => { input.CategoryId = item.Id; })"
            checked="@(item.Id == input.CategoryId)"
          />@item.CategoryName</label
        >
        } }
      </div>
      <div class="box-item"></div>
      <div class="box-item">
        <b>标签：</b>
        <input type="text" @bind="@tags" @bind:event="oninput" />
      </div>
    </Box>
  </div>
  }
</AdminLayout>
```

添加了四个 input 框，分别用来绑定标题、作者、URL、时间，`<div id="editor"></div>`中为编辑器所需。

然后我这里还是把之前的弹窗组件搞出来了，执行逻辑不介绍了，在弹窗组件中自定义显示分类和标签的内容，将获取到的分类和标签绑定到具体位置。

每个分类都是一个 radio 标签，并且对应一个点击事件，点哪个就把当前分类的 Id 赋值给`PostForAdminDto`对象。

所有的 input 框都使用`@bind`和`@bind:event`绑定数据和获取数据。

`Box`弹窗组件这里自定义了按钮文字，`ButtonText="发布"`。

```csharp
/// <summary>
/// 改变Open状态，通知组件渲染
/// </summary>
private async Task ChangeOpenStatus()
{
    Open = true;

    var markdown = await Common.InvokeAsync<string>("editor.getMarkdown");
    var html = await Common.InvokeAsync<string>("editor.getHTML");

    if (string.IsNullOrEmpty(input.Title) || string.IsNullOrEmpty(input.Url) ||
        string.IsNullOrEmpty(input.Author) || string.IsNullOrEmpty(markdown) ||
        string.IsNullOrEmpty(html))
    {
        await Alert();
    }

    input.Html = html;
    input.Markdown = markdown;

    StateHasChanged();
}

/// <summary>
/// 暴漏给JS执行，弹窗确认框
/// </summary>
[JSInvokable("showbox")]
public static void ShowBox()
{
    action.Invoke();
}
```

```csharp
/// <summary>
/// alert提示
/// </summary>
/// <returns></returns>
private async Task Alert()
{
    Open = false;

    await Common.InvokeAsync("alert", "\n💥💢好像漏了点什么吧💢💥");
    return;
}
```

现在可以来看看`ChangeOpenStatus`方法了，这个是改变当前弹窗状态的一个方法。为什么需要这个方法呢?

因为在 Blazor 中 JavaScript 想要调用组件内的方法，方法必须是静态的，那么只能通过这种方式去实现了，在静态方法是不能够直接改变弹窗的状态值的。

其实也可以不用这么麻烦，因为我在编辑器上自定义了一个按钮，为了好看一些所以只能曲折一点，嫌麻烦的可以直接在页面上搞个按钮执行保存数据逻辑也是一样的。

使用`JSInvokable`Attribute 需要在`_Imports.razor`中添加命名空间`@using Microsoft.JSInterop`。

`ChangeOpenStatus`中获取到文章内容：HTML 和 markdown，赋值给`PostForAdminDto`对象，要先进行判断页面上的几个参数是否有值，没值的话给出提示执行`Alert()`方法，最后使用`StateHasChanged()`通知组件其状态已更改。

`Alert`方法就是调用原生的 JavaScript`alert`方法，给出一个提示。

`ShowBox`就是暴漏给 JavaScript 的方法，使用`DotNet.invokeMethodAsync('Meowv.Blog.BlazorApp', 'showbox');`进行调用。

那么现在一切都正常进行的情况下，点击编辑器上自定义的保存按钮，页面上值不为空的情况下就会弹出我们的弹窗组件`Box`。

最后在弹窗组件的回调方法中执行新增文章还是更新文章。

```csharp
/// <summary>
/// 确认按钮点击事件
/// </summary>
/// <returns></returns>
private async Task SubmitAsync()
{
    if (string.IsNullOrEmpty(tags) || input.CategoryId == 0)
    {
        await Alert();
    }

    input.Tags = tags.Split(",");

    var responseMessage = new HttpResponseMessage();

    if (Id.HasValue)
        responseMessage = await Http.PutAsJsonAsync($"/blog/post?id={Id}", input);
    else
        responseMessage = await Http.PostAsJsonAsync("/blog/post", input);

    var result = await responseMessage.Content.ReadFromJsonAsync<ServiceResult>();
    if (result.Success)
    {
        await Common.NavigateTo("/admin/posts");
    }
}
```

打开弹窗后执行回调事件之前还是要判断值是否为空，为空的情况下还是给出`alert`提示，此时将 tags 标签还是转换成 List 列表，根据 Id 是否有值去执行新增数据或者更新数据，最终成功后跳转到文章列表页。

![ ](/images/abp/blazor-bestpractice-8-04.gif)

![ ](/images/abp/blazor-bestpractice-8-05.gif)

本片到这里就结束了，主要攻克了在 Blazor 中使用 Markdown 编辑器实现新增和更新文章，这个系列差不多就快结束了，预计还有 2 篇的样子，感谢各位的支持。
