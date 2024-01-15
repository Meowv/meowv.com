---
title: 统一规范API，包装返回模型
author: 阿星𝑷𝒍𝒖𝒔
date: 2020-05-21 11:00:21
categories: .NET
tags:
  - .NET Core
  - abp vNext
  - WebApi
  - Model
---

上一篇文章使用自定义仓储完成了简单的增删改查案例，有心的同学可以看出，我们的返回参数一塌糊涂，显得很不友好。

在实际开发过程中，每个公司可能不尽相同，但都大同小异，我们的返回数据都是包裹在一个公共的模型下面的，而不是直接返回最终数据，在返回参数中，显示出当前请求的时间戳，是否请求成功，如果错误那么错误的消息是什么，状态码(状态码可以是我们自己定义的值)等等。可能显得很繁琐，没必要，但这样做的好处毋庸置疑，除了美化了我们的 API 之外，也方便了前端同学的数据处理。

我们将统一的返回模型放在`.ToolKits`层中，之前说过这里主要是公共的工具类、扩展方法。

新建一个 Base 文件夹，添加响应实体类`ServiceResult.cs`，在 Enum 文件夹下单独定义一个`ServiceResultCode`响应码枚举，0/1。分别代表 成功和失败。

```csharp
//ServiceResultCode.cs
namespace Meowv.Blog.ToolKits.Base.Enum
{
    /// <summary>
    /// 服务层响应码枚举
    /// </summary>
    public enum ServiceResultCode
    {
        /// <summary>
        /// 成功
        /// </summary>
        Succeed = 0,

        /// <summary>
        /// 失败
        /// </summary>
        Failed = 1,
    }
}
```

```csharp
//ServiceResult.cs
using Meowv.Blog.ToolKits.Base.Enum;
using System;

namespace Meowv.Blog.ToolKits.Base
{
    /// <summary>
    /// 服务层响应实体
    /// </summary>
    public class ServiceResult
    {
        /// <summary>
        /// 响应码
        /// </summary>
        public ServiceResultCode Code { get; set; }

        /// <summary>
        /// 响应信息
        /// </summary>
        public string Message { get; set; }

        /// <summary>
        /// 成功
        /// </summary>
        public bool Success => Code == ServiceResultCode.Succeed;

        /// <summary>
        /// 时间戳(毫秒)
        /// </summary>
        public long Timestamp { get; } = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        /// <summary>
        /// 响应成功
        /// </summary>
        /// <param name="message"></param>
        /// <param name="data"></param>
        /// <returns></returns>
        public void IsSuccess(string message = "")
        {
            Message = message;
            Code = ServiceResultCode.Succeed;
        }

        /// <summary>
        /// 响应失败
        /// </summary>
        /// <param name="message"></param>
        /// <param name="data"></param>
        /// <returns></returns>
        public void IsFailed(string message = "")
        {
            Message = message;
            Code = ServiceResultCode.Failed;
        }

        /// <summary>
        /// 响应失败
        /// </summary>
        /// <param name="exexception></param>
        /// <param name="data"></param>
        /// <returns></returns>
        public void IsFailed(Exception exception)
        {
            Message = exception.InnerException?.StackTrace;
            Code = ServiceResultCode.Failed;
        }
    }
}
```

可以看到，还定义了 string 类型的 Message，bool 类型的 Success，Success 取决于`Code == ServiceResultCode.Succeed`的结果。还有一个当前的时间戳 Timestamp。

其中还有`IsSuccess(...)`和`IsFailed(...)`方法，当我们成功返回数据或者当系统出错或者参数异常的时候执行，这一点也不难理解吧。

这个返回模型暂时只支持无需返回参数的 api 使用，还需要扩展一下，当我们需要返回其它各种复杂类型的数据就行不通了。所以还需要添加一个支持泛型的返回模型，新建模型类：`ServiceResultOfT.cs`，这里的 T 就是我们的返回结果，然后继承我们的 ServiceResult，指定 T 为 class。并重新编写一个`IsSuccess(...)`方法，代码如下：

```csharp
//ServiceResultOfT.cs
using Meowv.Blog.ToolKits.Base.Enum;

namespace Meowv.Blog.ToolKits.Base
{
    /// <summary>
    /// 服务层响应实体(泛型)
    /// </summary>
    /// <typeparam name="T"></typeparam>
    public class ServiceResult<T> : ServiceResult where T : class
    {
        /// <summary>
        /// 返回结果
        /// </summary>
        public T Result { get; set; }

        /// <summary>
        /// 响应成功
        /// </summary>
        /// <param name="result"></param>
        /// <param name="message"></param>
        public void IsSuccess(T result = null, string message = "")
        {
            Message = message;
            Code = ServiceResultCode.Succeed;
            Result = result;
        }
    }
}
```

此时针对无需返回参数和需要返回参数的 api 都可以满足要求了。但是还有一种就没办法了，那就是带分页的数据，我们都应该知道想要分页，数据总数肯定是必不可少的。

所以此时还需要扩展一个分页的响应实体，当我们使用的时候，直接将分页响应实体作为上面写的`ServiceResult<T>`中的 T 参数，即可满足需求。

新建文件夹 Paged，添加总数接口`IHasTotalCount`、返回结果列表接口`IListResult`

```csharp
//IHasTotalCount.cs
namespace Meowv.Blog.ToolKits.Base.Paged
{
    public interface IHasTotalCount
    {
        /// <summary>
        /// 总数
        /// </summary>
        int Total { get; set; }
    }
}

//IListResult.cs
using System.Collections.Generic;

namespace Meowv.Blog.ToolKits.Base.Paged
{
    public interface IListResult<T>
    {
        /// <summary>
        /// 返回结果
        /// </summary>
        IReadOnlyList<T> Item { get; set; }
    }
}
```

`IListResult<T>`接受一个参数，并将其指定为`IReadOnlyList`返回。

现在来实现`IListResult`接口，新建`ListResult`实现类，继承`IListResult`，在构造函数中为其赋值，代码如下：

```csharp
//ListResult.cs
using System.Collections.Generic;

namespace Meowv.Blog.ToolKits.Base.Paged
{
    public class ListResult<T> : IListResult<T>
    {
        IReadOnlyList<T> item;

        public IReadOnlyList<T> Item
        {
            get => item ?? (item = new List<T>());
            set => item = value;
        }

        public ListResult()
        {
        }

        public ListResult(IReadOnlyList<T> item)
        {
            Item = item;
        }
    }
}
```

最后新建我们的分页响应实体接口：`IPagedList`和分页响应实体实现类：`PagedList`，它同时也要接受一个泛型参数 T。

接口继承了`IListResult<T>`和`IHasTotalCount`，实现类继承`ListResult<T>`和`IPagedList<T>`，在构造函数中为其赋值。代码如下：

```csharp
//IPagedList.cs
namespace Meowv.Blog.ToolKits.Base.Paged
{
    public interface IPagedList<T> : IListResult<T>, IHasTotalCount
    {
    }
}

//PagedList.cs
using Meowv.Blog.ToolKits.Base.Paged;
using System.Collections.Generic;

namespace Meowv.Blog.ToolKits.Base
{
    /// <summary>
    /// 分页响应实体
    /// </summary>
    /// <typeparam name="T"></typeparam>
    public class PagedList<T> : ListResult<T>, IPagedList<T>
    {
        /// <summary>
        /// 总数
        /// </summary>
        public int Total { get; set; }

        public PagedList()
        {
        }

        public PagedList(int total, IReadOnlyList<T> result) : base(result)
        {
            Total = total;
        }
    }
}
```

到这里我们的返回模型就圆满了，看一下此时下我们的项目层级目录。

![ ](/images/abp/return-api-01.png)

接下来去实践一下，修改我们之前创建的增删改查接口的返回参数。

```csharp
//IBlogService.cs
using Meowv.Blog.Application.Contracts.Blog;
using Meowv.Blog.ToolKits.Base;
using System.Threading.Tasks;

namespace Meowv.Blog.Application.Blog
{
    public interface IBlogService
    {
        //Task<bool> InsertPostAsync(PostDto dto);
        Task<ServiceResult<string>> InsertPostAsync(PostDto dto);

        //Task<bool> DeletePostAsync(int id);
        Task<ServiceResult> DeletePostAsync(int id);

        //Task<bool> UpdatePostAsync(int id, PostDto dto);
        Task<ServiceResult<string>> UpdatePostAsync(int id, PostDto dto);

        //Task<PostDto> GetPostAsync(int id);
        Task<ServiceResult<PostDto>> GetPostAsync(int id);
    }
}
```

接口全部为异步方式，用`ServiceResult`包裹作为返回模型，添加和更新 T 参数为 string 类型，删除就直接不返回结果，然后查询为：`ServiceResult<PostDto>`，再看一下实现类：

```csharp
//BlogService.cs
...
        public async Task<ServiceResult<string>> InsertPostAsync(PostDto dto)
        {
            var result = new ServiceResult<string>();

            var entity = new Post
            {
                Title = dto.Title,
                Author = dto.Author,
                Url = dto.Url,
                Html = dto.Html,
                Markdown = dto.Markdown,
                CategoryId = dto.CategoryId,
                CreationTime = dto.CreationTime
            };

            var post = await _postRepository.InsertAsync(entity);
            if (post == null)
            {
                result.IsFailed("添加失败");
                return result;
            }

            result.IsSuccess("添加成功");
            return result;
        }

        public async Task<ServiceResult> DeletePostAsync(int id)
        {
            var result = new ServiceResult();

            await _postRepository.DeleteAsync(id);

            return result;
        }

        public async Task<ServiceResult<string>> UpdatePostAsync(int id, PostDto dto)
        {
            var result = new ServiceResult<string>();

            var post = await _postRepository.GetAsync(id);
            if (post == null)
            {
                result.IsFailed("文章不存在");
                return result;
            }

            post.Title = dto.Title;
            post.Author = dto.Author;
            post.Url = dto.Url;
            post.Html = dto.Html;
            post.Markdown = dto.Markdown;
            post.CategoryId = dto.CategoryId;
            post.CreationTime = dto.CreationTime;

            await _postRepository.UpdateAsync(post);


            result.IsSuccess("更新成功");
            return result;
        }

        public async Task<ServiceResult<PostDto>> GetPostAsync(int id)
        {
            var result = new ServiceResult<PostDto>();

            var post = await _postRepository.GetAsync(id);
            if (post == null)
            {
                result.IsFailed("文章不存在");
                return result;
            }

            var dto = new PostDto
            {
                Title = post.Title,
                Author = post.Author,
                Url = post.Url,
                Html = post.Html,
                Markdown = post.Markdown,
                CategoryId = post.CategoryId,
                CreationTime = post.CreationTime
            };

            result.IsSuccess(dto);
            return result;
        }
...
```

当成功时，调用`IsSuccess(...)`方法，当失败时，调用`IsFailed(...)`方法。最终我们返回的是`new ServiceResult()`或者`new ServiceResult<T>()`对象。

同时不要忘记在 Controller 中也需要修改一下，如下：

```csharp
//BlogController.cs
...
        ...
        public async Task<ServiceResult<string>> InsertPostAsync([FromBody] PostDto dto)
        ...

        ...
        public async Task<ServiceResult> DeletePostAsync([Required] int id)
        ...

        ...
        public async Task<ServiceResult<string>> UpdatePostAsync([Required] int id, [FromBody] PostDto dto)
        ...

        ...
        public async Task<ServiceResult<PostDto>> GetPostAsync([Required] int id)
        ...
...
```

此时再去我们的 Swagger 文档发起请求，这里我们调用一下查询接口看看返回的样子，看看效果吧。

![ ](/images/abp/return-api-02.png)

本篇内容比较简单，主要是包装我们的 api，让返回结果显得比较正式一点。那么，你学会了吗？😁😁😁
