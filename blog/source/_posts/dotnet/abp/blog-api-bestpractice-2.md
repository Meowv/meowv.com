---
title: 博客接口实战篇（二）
author: 阿星𝑷𝒍𝒖𝒔
date: 2020-06-03 08:23:03
categories: .NET
tags:
  - .NET Core
  - abp vNext
  - WebApi
---

上篇文章完成了两个接口：文章列表页、文章详情页，本篇继续。

## 分类列表

![ ](/images/abp/blog-api-bestpractice-2-01.png)

分析：这里多了一个统计文章数量的字段，可以直接新建一个模型`QueryCategoryDto.cs`继承`CategoryDto`。

```csharp
//QueryCategoryDto.cs
namespace Meowv.Blog.Application.Contracts.Blog
{
    public class QueryCategoryDto : CategoryDto
    {
        /// <summary>
        /// 总数
        /// </summary>
        public int Count { get; set; }
    }
}
```

添加查询分类列表接口和缓存接口。

```csharp
//IBlogService.Category.cs
using Meowv.Blog.Application.Contracts.Blog;
using Meowv.Blog.ToolKits.Base;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Blog.Application.Blog
{
    public partial interface IBlogService
    {
        /// <summary>
        /// 查询分类列表
        /// </summary>
        /// <returns></returns>
        Task<ServiceResult<IEnumerable<QueryCategoryDto>>> QueryCategoriesAsync();
    }
}
```

```csharp
//IBlogCacheService.Category.cs
using Meowv.Blog.Application.Contracts.Blog;
using Meowv.Blog.ToolKits.Base;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Blog.Application.Caching.Blog
{
    public partial interface IBlogCacheService
    {
        /// <summary>
        /// 查询分类列表
        /// </summary>
        /// <param name="factory"></param>
        /// <returns></returns>
        Task<ServiceResult<IEnumerable<QueryCategoryDto>>> QueryCategoriesAsync(Func<Task<ServiceResult<IEnumerable<QueryCategoryDto>>>> factory);
    }
}
```

分别实现这两个接口。

```csharp
//BlogCacheService.Category.cs
using Meowv.Blog.Application.Contracts.Blog;
using Meowv.Blog.ToolKits.Base;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using static Meowv.Blog.Domain.Shared.MeowvBlogConsts;

namespace Meowv.Blog.Application.Caching.Blog.Impl
{
    public partial class BlogCacheService
    {
        private const string KEY_QueryCategories = "Blog:Category:QueryCategories";

        /// <summary>
        /// 查询分类列表
        /// </summary>
        /// <param name="factory"></param>
        /// <returns></returns>
        public async Task<ServiceResult<IEnumerable<QueryCategoryDto>>> QueryCategoriesAsync(Func<Task<ServiceResult<IEnumerable<QueryCategoryDto>>>> factory)
        {
            return await Cache.GetOrAddAsync(KEY_QueryCategories, factory, CacheStrategy.ONE_DAY);
        }
    }
}
```

```csharp
//BlogService.Category.cs
using Meowv.Blog.Application.Contracts.Blog;
using Meowv.Blog.ToolKits.Base;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace Meowv.Blog.Application.Blog.Impl
{
    public partial class BlogService
    {
        /// <summary>
        /// 查询分类列表
        /// </summary>
        /// <returns></returns>
        public async Task<ServiceResult<IEnumerable<QueryCategoryDto>>> QueryCategoriesAsync()
        {
            return await _blogCacheService.QueryCategoriesAsync(async () =>
            {
                var result = new ServiceResult<IEnumerable<QueryCategoryDto>>();

                var list = from category in await _categoryRepository.GetListAsync()
                           join posts in await _postRepository.GetListAsync()
                           on category.Id equals posts.CategoryId
                           group category by new
                           {
                               category.CategoryName,
                               category.DisplayName
                           } into g
                           select new QueryCategoryDto
                           {
                               CategoryName = g.Key.CategoryName,
                               DisplayName = g.Key.DisplayName,
                               Count = g.Count()
                           };

                result.IsSuccess(list);
                return result;
            });
        }
    }
}
```

缓存就不说了，查询分类列表，联合查询文章和分类两张表，关联字段为 CategoryId，然后分组，计算出对应的数量，在`BlogController`中添加 API。

```csharp
/// <summary>
/// 查询分类列表
/// </summary>
/// <returns></returns>
[HttpGet]
[Route("categories")]
public async Task<ServiceResult<IEnumerable<QueryCategoryDto>>> QueryCategoriesAsync()
{
    return await _blogService.QueryCategoriesAsync();
}
```

![ ](/images/abp/blog-api-bestpractice-2-02.png)

## 标签列表

![ ](/images/abp/blog-api-bestpractice-2-03.png)

分析：和分类列表差不多，新建模型`QueryTagDto.cs`继承`TagDto`。

```csharp
//QueryTagDto.cs
namespace Meowv.Blog.Application.Contracts.Blog
{
    public class QueryTagDto : TagDto
    {
        /// <summary>
        /// 总数
        /// </summary>
        public int Count { get; set; }
    }
}
```

添加查询标签列表接口和缓存接口。

```csharp
//IBlogCacheService.Tag.cs
using Meowv.Blog.Application.Contracts.Blog;
using Meowv.Blog.ToolKits.Base;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Blog.Application.Caching.Blog
{
    public partial interface IBlogCacheService
    {
        /// <summary>
        /// 查询标签列表
        /// </summary>
        /// <param name="factory"></param>
        /// <returns></returns>
        Task<ServiceResult<IEnumerable<QueryTagDto>>> QueryTagsAsync(Func<Task<ServiceResult<IEnumerable<QueryTagDto>>>> factory);
    }
}
```

```csharp
//IBlogService.Tag.cs
using Meowv.Blog.Application.Contracts.Blog;
using Meowv.Blog.ToolKits.Base;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Blog.Application.Blog
{
    public partial interface IBlogService
    {
        /// <summary>
        /// 查询标签列表
        /// </summary>
        /// <returns></returns>
        Task<ServiceResult<IEnumerable<QueryTagDto>>> QueryTagsAsync();
    }
}
```

分别实现这两个接口。

```csharp
//BlogCacheService.Tag.cs
using Meowv.Blog.Application.Contracts.Blog;
using Meowv.Blog.ToolKits.Base;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using static Meowv.Blog.Domain.Shared.MeowvBlogConsts;

namespace Meowv.Blog.Application.Caching.Blog.Impl
{
    public partial class BlogCacheService
    {
        private const string KEY_QueryTags = "Blog:Tag:QueryTags";

        /// <summary>
        /// 查询标签列表
        /// </summary>
        /// <param name="factory"></param>
        /// <returns></returns>
        public async Task<ServiceResult<IEnumerable<QueryTagDto>>> QueryTagsAsync(Func<Task<ServiceResult<IEnumerable<QueryTagDto>>>> factory)
        {
            return await Cache.GetOrAddAsync(KEY_QueryTags, factory, CacheStrategy.ONE_DAY);
        }
    }
}
```

```csharp
//BlogService.Tag.cs
using Meowv.Blog.Application.Contracts.Blog;
using Meowv.Blog.ToolKits.Base;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace Meowv.Blog.Application.Blog.Impl
{
    public partial class BlogService
    {
        /// <summary>
        /// 查询标签列表
        /// </summary>
        /// <returns></returns>
        public async Task<ServiceResult<IEnumerable<QueryTagDto>>> QueryTagsAsync()
        {
            return await _blogCacheService.QueryTagsAsync(async () =>
            {
                var result = new ServiceResult<IEnumerable<QueryTagDto>>();

                var list = from tags in await _tagRepository.GetListAsync()
                           join post_tags in await _postTagRepository.GetListAsync()
                           on tags.Id equals post_tags.TagId
                           group tags by new
                           {
                               tags.TagName,
                               tags.DisplayName
                           } into g
                           select new QueryTagDto
                           {
                               TagName = g.Key.TagName,
                               DisplayName = g.Key.DisplayName,
                               Count = g.Count()
                           };

                result.IsSuccess(list);
                return result;
            });
        }
    }
}
```

查询标签列表需要联合查询 tags 和 post_tags，根据 TagId 进行关联，然后分组从而获取标签下文章的总数，在`BlogController`中添加 API。

```csharp
/// <summary>
/// 查询标签列表
/// </summary>
/// <returns></returns>
[HttpGet]
[Route("tags")]
public async Task<ServiceResult<IEnumerable<QueryTagDto>>> QueryTagsAsync()
{
    return await _blogService.QueryTagsAsync();
}
```

![ ](/images/abp/blog-api-bestpractice-2-04.png)

## 分类名称&文章列表

![ ](/images/abp/blog-api-bestpractice-2-05.png)

分析：此页面下包含两个接口，查询分类的名称和当前分类下的文章列表，和文章列表不同的是，它不带分页。分类包含两个字段，分类名称和展示名称，我们要把真正的名称查询出来展示在页面上。

### 分类名称

不需要给他添加返回模型，直接返回一个 string 类型即可，同时给一个查询参数 name，添加获取分类名称接口和缓存接口。

```csharp
//IBlogService.Category.cs
/// <summary>
/// 获取分类名称
/// </summary>
/// <param name="name"></param>
/// <returns></returns>
Task<ServiceResult<string>> GetCategoryAsync(string name);
```

```csharp
//IBlogCacheService.Category.cs
/// <summary>
/// 获取分类名称
/// </summary>
/// <param name="name"></param>
/// <param name="factory"></param>
/// <returns></returns>
Task<ServiceResult<string>> GetCategoryAsync(string name, Func<Task<ServiceResult<string>>> factory);
```

实现这两个接口。

```csharp
//BlogCacheService.Category.cs
...
    public partial class BlogCacheService
    {
        private const string KEY_GetCategory = "Blog:Category:GetCategory-{0}";

        /// <summary>
        /// 获取分类名称
        /// </summary>
        /// <param name="name"></param>
        /// <param name="factory"></param>
        /// <returns></returns>
        public async Task<ServiceResult<string>> GetCategoryAsync(string name, Func<Task<ServiceResult<string>>> factory)
        {
            return await Cache.GetOrAddAsync(KEY_GetCategory.FormatWith(name), factory, CacheStrategy.ONE_DAY);
        }
    }
...
```

```csharp
//BlogService.Category.cs
/// <summary>
/// 获取分类名称
/// </summary>
/// <param name="name"></param>
/// <returns></returns>
public async Task<ServiceResult<string>> GetCategoryAsync(string name)
{
    return await _blogCacheService.GetCategoryAsync(name, async () =>
    {
        var result = new ServiceResult<string>();

        var category = await _categoryRepository.FindAsync(x => x.DisplayName.Equals(name));
        if (null == category)
        {
            result.IsFailed(ResponseText.WHAT_NOT_EXIST.FormatWith("分类", name));
            return result;
        }

        result.IsSuccess(category.CategoryName);
        return result;
    });
}
```

`FormatWith()`是扩展方法，`ResponseText.WHAT_NOT_EXIST`是之前说过的常量，直接查询是否存在当前 name 的分类，如果不存在给出错误提示，存在的话，则只返回分类名称，在`BlogController`中添加 API。

```csharp
/// <summary>
/// 获取分类名称
/// </summary>
/// <param name="name"></param>
/// <returns></returns>
[HttpGet]
[Route("category")]
public async Task<ServiceResult<string>> GetCategoryAsync(([Required] string name)
{
    return await _blogService.GetCategoryAsync(name);
}
```

`[Required]`Attribute 指定参数 name 必填。

![ ](/images/abp/blog-api-bestpractice-2-06.png)

![ ](/images/abp/blog-api-bestpractice-2-07.png)

### (分类)文章列表

通过分类名称查询文章列表和分页查询文章列表返回模型是一样的，只是不用分页，所以直接返回一个列表就可以了，添加通过分类名称查询文章列表和缓存的接口。

```csharp
//IBlogService.Post.cs
/// <summary>
/// 通过分类名称查询文章列表
/// </summary>
/// <param name="name"></param>
/// <returns></returns>
Task<ServiceResult<IEnumerable<QueryPostDto>>> QueryPostsByCategoryAsync(string name);
```

```csharp
//IBlogCacheService.Post.cs
/// <summary>
/// 通过分类名称查询文章列表
/// </summary>
/// <param name="name"></param>
/// <param name="factory"></param>
/// <returns></returns>
Task<ServiceResult<IEnumerable<QueryPostDto>>> QueryPostsByCategoryAsync(string name, Func<Task<ServiceResult<IEnumerable<QueryPostDto>>>> factory);
```

分别实现这两个接口。

```csharp
//BlogCacheService.Post.cs
...
    public partial class BlogCacheService
    {
        private const string KEY_QueryPostsByCategory = "Blog:Post:QueryPostsByCategory-{0}";

        /// <summary>
        /// 通过分类名称查询文章列表
        /// </summary>
        /// <param name="name"></param>
        /// <param name="factory"></param>
        /// <returns></returns>
        public async Task<ServiceResult<IEnumerable<QueryPostDto>>> QueryPostsByCategoryAsync(string name, Func<Task<ServiceResult<IEnumerable<QueryPostDto>>>> factory)
        {
            return await Cache.GetOrAddAsync(KEY_QueryPostsByCategory.FormatWith(name), factory, CacheStrategy.ONE_DAY);
        }
    }
...
```

```csharp
//BlogService.Post.cs
/// <summary>
/// 通过分类名称查询文章列表
/// </summary>
/// <param name="name"></param>
/// <returns></returns>
public async Task<ServiceResult<IEnumerable<QueryPostDto>>> QueryPostsByCategoryAsync(string name)
{
    return await _blogCacheService.QueryPostsByCategoryAsync(name, async () =>
    {
        var result = new ServiceResult<IEnumerable<QueryPostDto>>();

        var list = (from posts in await _postRepository.GetListAsync()
                    join categories in await _categoryRepository.GetListAsync()
                    on posts.CategoryId equals categories.Id
                    where categories.DisplayName.Equals(name)
                    orderby posts.CreationTime descending
                    select new PostBriefDto
                    {
                        Title = posts.Title,
                        Url = posts.Url,
                        Year = posts.CreationTime.Year,
                        CreationTime = posts.CreationTime.TryToDateTime()
                    })
                   .GroupBy(x => x.Year)
                   .Select(x => new QueryPostDto
                   {
                       Year = x.Key,
                       Posts = x.ToList()
                   });

        result.IsSuccess(list);
        return result;
    });
}
```

这个逻辑和分页查询文章列表是差不多的，联合查询文章表和分类表，关联字段为 CategoryId，指定查询条件`categories.DisplayName==name`，以 CreationTime 倒序排序，年份分组，筛选出所需字段返回，在`BlogController`中添加 API。

```csharp
/// <summary>
/// 通过分类名称查询文章列表
/// </summary>
/// <param name="name"></param>
/// <returns></returns>
[HttpGet]
[Route("posts/category")]
public async Task<ServiceResult<IEnumerable<QueryPostDto>>> QueryPostsByCategoryAsync([Required] string name)
{
    return await _blogService.QueryPostsByCategoryAsync(name);
}
```

![ ](/images/abp/blog-api-bestpractice-2-08.png)

## 标签名称&文章列表

![ ](/images/abp/blog-api-bestpractice-2-09.png)

分析：此页面和分类页一样，包含两个接口，查询标签的名称和当前标签下的文章列表。

### 标签名称

添加获取标签名称接口和缓存接口，`GetTagAsync()`。

```csharp
//IBlogService.Tag.cs
/// <summary>
/// 获取标签名称
/// </summary>
/// <param name="name"></param>
/// <returns></returns>
Task<ServiceResult<string>> GetTagAsync(string name);
```

```csharp
//IBlogCacheService.Tag.cs
/// <summary>
/// 获取标签名称
/// </summary>
/// <param name="name"></param>
/// <param name="factory"></param>
/// <returns></returns>
Task<ServiceResult<string>> GetTagAsync(string name, Func<Task<ServiceResult<string>>> factory);
```

实现这两个接口。

```csharp
//BlogCacheService.Tag.cs
...
    public partial class BlogCacheService
    {
        private const string KEY_GetTag = "Blog:Tag:GetTag-{0}";

        /// <summary>
        /// 获取标签名称
        /// </summary>
        /// <param name="name"></param>
        /// <param name="factory"></param>
        /// <returns></returns>
        public async Task<ServiceResult<string>> GetTagAsync(string name, Func<Task<ServiceResult<string>>> factory)
        {
            return await Cache.GetOrAddAsync(KEY_GetTag.FormatWith(name), factory, CacheStrategy.ONE_DAY);
        }
    }
...
```

```csharp
//BlogService.Tag.cs
/// <summary>
/// 获取标签名称
/// </summary>
/// <param name="name"></param>
/// <returns></returns>
public async Task<ServiceResult<string>> GetTagAsync(string name)
{
    return await _blogCacheService.GetTagAsync(name, async () =>
    {
        var result = new ServiceResult<string>();

        var tag = await _tagRepository.FindAsync(x => x.DisplayName.Equals(name));
        if (null == tag)
        {
            result.IsFailed(ResponseText.WHAT_NOT_EXIST.FormatWith("标签", name));
            return result;
        }

        result.IsSuccess(tag.TagName);
        return result;
    });
}
```

`FormatWith()`是扩展方法，`ResponseText.WHAT_NOT_EXIST`是之前说过的常量，直接查询是否存在当前 name 的分类，如果不存在给出错误提示，存在的话，则只返回分类名称，在`BlogController`中添加 API。

```csharp
/// <summary>
/// 获取标签名称
/// </summary>
/// <param name="name"></param>
/// <returns></returns>
[HttpGet]
[Route("tag")]
public async Task<ServiceResult<string>> GetTagAsync(string name)
{
    return await _blogService.GetTagAsync(name);
}
```

`[Required]`Attribute 指定参数 name 必填。

![ ](/images/abp/blog-api-bestpractice-2-10.png)

![ ](/images/abp/blog-api-bestpractice-2-11.png)

### (标签)文章列表

和上面一模一样的，添加通过标签名称查询文章列表接口和缓存接口。

```csharp
//IBlogService.Post.cs
/// <summary>
/// 通过标签名称查询文章列表
/// </summary>
/// <param name="name"></param>
/// <returns></returns>
Task<ServiceResult<IEnumerable<QueryPostDto>>> QueryPostsByTagAsync(string name);
```

```csharp
//IBlogCacheService.Post.cs
/// <summary>
/// 通过标签名称查询文章列表
/// </summary>
/// <param name="name"></param>
/// <param name="factory"></param>
/// <returns></returns>
Task<ServiceResult<IEnumerable<QueryPostDto>>> QueryPostsByTagAsync(string name, Func<Task<ServiceResult<IEnumerable<QueryPostDto>>>> factory);
```

分别实现这两个接口。

```csharp
//BlogCacheService.Post.cs
...
    public partial class BlogCacheService
    {
        private const string KEY_QueryPostsByTag = "Blog:Post:QueryPostsByTag-{0}";

        /// <summary>
        /// 通过标签名称查询文章列表
        /// </summary>
        /// <param name="name"></param>
        /// <param name="factory"></param>
        /// <returns></returns>
        public async Task<ServiceResult<IEnumerable<QueryPostDto>>> QueryPostsByTagAsync(string name, Func<Task<ServiceResult<IEnumerable<QueryPostDto>>>> factory)
        {
            return await Cache.GetOrAddAsync(KEY_QueryPostsByTag.FormatWith(name), factory, CacheStrategy.ONE_DAY);
        }
    }
...
```

```csharp
//BlogService.Post.cs
/// <summary>
/// 通过标签名称查询文章列表
/// </summary>
/// <param name="name"></param>
/// <returns></returns>
public async Task<ServiceResult<IEnumerable<QueryPostDto>>> QueryPostsByTagAsync(string name)
{
    return await _blogCacheService.QueryPostsByTagAsync(name, async () =>
    {
        var result = new ServiceResult<IEnumerable<QueryPostDto>>();

        var list = (from post_tags in await _postTagRepository.GetListAsync()
                    join tags in await _tagRepository.GetListAsync()
                    on post_tags.TagId equals tags.Id
                    join posts in await _postRepository.GetListAsync()
                    on post_tags.PostId equals posts.Id
                    where tags.DisplayName.Equals(name)
                    orderby posts.CreationTime descending
                    select new PostBriefDto
                    {
                        Title = posts.Title,
                        Url = posts.Url,
                        Year = posts.CreationTime.Year,
                        CreationTime = posts.CreationTime.TryToDateTime()
                    })
                    .GroupBy(x => x.Year)
                    .Select(x => new QueryPostDto
                    {
                        Year = x.Key,
                        Posts = x.ToList()
                    });

        result.IsSuccess(list);
        return result;
    });
}
```

这个查询有点特殊，联合查询了 3 张表，先查 post_tags 和 tags，关联字段 TagId，再根据 PostId 查询 posts，指定查询条件 tags.DisplayName==name，以 CreationTime 倒序排序，年份分组，筛选出所需字段返回，在 BlogController 中添加 API。

```csharp
/// <summary>
/// 通过标签名称查询文章列表
/// </summary>
/// <param name="name"></param>
/// <returns></returns>
[HttpGet]
[Route("posts/tag")]
public async Task<ServiceResult<IEnumerable<QueryPostDto>>> QueryPostsByTagAsync(string name)
{
    return await _blogService.QueryPostsByTagAsync(name);
}
```

![ ](/images/abp/blog-api-bestpractice-2-12.png)

至此，基本上完成了博客前端所需的所有查询接口，就还剩下友链的查询，大家可以自己完成，后面如果需要什么新的接口再回头来写就好了。
