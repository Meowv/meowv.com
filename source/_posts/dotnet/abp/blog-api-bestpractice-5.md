---
title: 博客接口实战篇（五）
author: 阿星𝑷𝒍𝒖𝒔
date: 2020-06-08 08:57:08
categories: .NET
tags:
  - .NET Core
  - abp vNext
  - WebApi
---

上篇文章完成了文章详情页数据查询和清除缓存的功能。

本篇继续完成分类、标签、友情链接的后台操作接口，还是那句话，这些纯 CRUD 的内容，建议还是自己动手完成比较好，本篇将不再啰嗦，直接贴代码，以供参考。

## 分类

添加接口：查询分类列表`QueryCategoriesForAdminAsync()`、新增分类`InsertCategoryAsync(...)`、更新分类`UpdateCategoryAsync(...)`、删除分类`DeleteCategoryAsync(...)`

```csharp
#region Categories

/// <summary>
/// 查询分类列表
/// </summary>
/// <returns></returns>
Task<ServiceResult<IEnumerable<QueryCategoryForAdminDto>>> QueryCategoriesForAdminAsync();

/// <summary>
/// 新增分类
/// </summary>
/// <param name="input"></param>
/// <returns></returns>
Task<ServiceResult> InsertCategoryAsync(EditCategoryInput input);

/// <summary>
/// 更新分类
/// </summary>
/// <param name="id"></param>
/// <param name="input"></param>
/// <returns></returns>
Task<ServiceResult> UpdateCategoryAsync(int id, EditCategoryInput input);

/// <summary>
/// 删除分类
/// </summary>
/// <param name="id"></param>
/// <returns></returns>
Task<ServiceResult> DeleteCategoryAsync(int id);

#endregion Categories
```

查询分类列表需要返回的模型类`QueryCategoryForAdminDto.cs`。

```csharp
//QueryCategoryForAdminDto.cs
namespace Meowv.Blog.Application.Contracts.Blog
{
    public class QueryCategoryForAdminDto : QueryCategoryDto
    {
        /// <summary>
        /// 主键
        /// </summary>
        public int Id { get; set; }
    }
}
```

新增分类和更新分类需要的输入参数`EditCategoryInput.cs`，直接继承`CategoryDto`即可。

```csharp
//EditCategoryInput.cs
namespace Meowv.Blog.Application.Contracts.Blog.Params
{
    public class EditCategoryInput : CategoryDto
    {
    }
}
```

分别实现这几个接口。

```csharp
/// <summary>
/// 查询分类列表
/// </summary>
/// <returns></returns>
public async Task<ServiceResult<IEnumerable<QueryCategoryForAdminDto>>> QueryCategoriesForAdminAsync()
{
    var result = new ServiceResult<IEnumerable<QueryCategoryForAdminDto>>();

    var posts = await _postRepository.GetListAsync();

    var categories = _categoryRepository.GetListAsync().Result.Select(x => new QueryCategoryForAdminDto
    {
        Id = x.Id,
        CategoryName = x.CategoryName,
        DisplayName = x.DisplayName,
        Count = posts.Count(p => p.CategoryId == x.Id)
    });

    result.IsSuccess(categories);
    return result;
}
```

```csharp
/// <summary>
/// 新增分类
/// </summary>
/// <param name="input"></param>
/// <returns></returns>
public async Task<ServiceResult> InsertCategoryAsync(EditCategoryInput input)
{
    var result = new ServiceResult();

    var category = ObjectMapper.Map<EditCategoryInput, Category>(input);
    await _categoryRepository.InsertAsync(category);

    result.IsSuccess(ResponseText.INSERT_SUCCESS);
    return result;
}
```

这里需要一条 AutoMapper 配置，将`EditCategoryInput`转换为`Category`，忽略 Id 字段。

```csharp
CreateMap<EditCategoryInput, Category>().ForMember(x => x.Id, opt => opt.Ignore());
```

```csharp
/// <summary>
/// 更新分类
/// </summary>
/// <param name="id"></param>
/// <param name="input"></param>
/// <returns></returns>
public async Task<ServiceResult> UpdateCategoryAsync(int id, EditCategoryInput input)
{
    var result = new ServiceResult();

    var category = await _categoryRepository.GetAsync(id);
    category.CategoryName = input.CategoryName;
    category.DisplayName = input.DisplayName;

    await _categoryRepository.UpdateAsync(category);

    result.IsSuccess(ResponseText.UPDATE_SUCCESS);
    return result;
}
```

```csharp
/// <summary>
/// 删除分类
/// </summary>
/// <param name="id"></param>
/// <returns></returns>
public async Task<ServiceResult> DeleteCategoryAsync(int id)
{
    var result = new ServiceResult();

    var category = await _categoryRepository.FindAsync(id);
    if (null == category)
    {
        result.IsFailed(ResponseText.WHAT_NOT_EXIST.FormatWith("Id", id));
        return result;
    }

    await _categoryRepository.DeleteAsync(id);

    result.IsSuccess(ResponseText.DELETE_SUCCESS);
    return result;
}
```

在`BlogController.Admin.cs`中添加接口。

```csharp
#region Categories

/// <summary>
/// 查询分类列表
/// </summary>
/// <returns></returns>
[HttpGet]
[Authorize]
[Route("admin/categories")]
[ApiExplorerSettings(GroupName = Grouping.GroupName_v2)]
public async Task<ServiceResult<IEnumerable<QueryCategoryForAdminDto>>> QueryCategoriesForAdminAsync()
{
    return await _blogService.QueryCategoriesForAdminAsync();
}

/// <summary>
/// 新增分类
/// </summary>
/// <param name="input"></param>
/// <returns></returns>
[HttpPost]
[Authorize]
[Route("category")]
[ApiExplorerSettings(GroupName = Grouping.GroupName_v2)]
public async Task<ServiceResult> InsertCategoryAsync([FromBody] EditCategoryInput input)
{
    return await _blogService.InsertCategoryAsync(input);
}

/// <summary>
/// 更新分类
/// </summary>
/// <param name="id"></param>
/// <param name="input"></param>
/// <returns></returns>
[HttpPut]
[Authorize]
[Route("category")]
[ApiExplorerSettings(GroupName = Grouping.GroupName_v2)]
public async Task<ServiceResult> UpdateCategoryAsync([Required] int id, [FromBody] EditCategoryInput input)
{
    return await _blogService.UpdateCategoryAsync(id, input);
}

/// <summary>
/// 删除分类
/// </summary>
/// <param name="id"></param>
/// <returns></returns>
[HttpDelete]
[Authorize]
[Route("category")]
[ApiExplorerSettings(GroupName = Grouping.GroupName_v2)]
public async Task<ServiceResult> DeleteCategoryAsync([Required] int id)
{
    return await _blogService.DeleteCategoryAsync(id);
}

#endregion Categories
```

![ ](/images/abp/blog-api-bestpractice-5-01.png)

## 标签

添加接口：查询标签列表`QueryTagsForAdminAsync()`、新增标签`InsertTagAsync(...)`、更新标签`UpdateTagAsync(...)`、删除标签`DeleteTagAsync(...)`

```csharp
#region Tags

/// <summary>
/// 查询标签列表
/// </summary>
/// <returns></returns>
Task<ServiceResult<IEnumerable<QueryTagForAdminDto>>> QueryTagsForAdminAsync();

/// <summary>
/// 新增标签
/// </summary>
/// <param name="input"></param>
/// <returns></returns>
Task<ServiceResult> InsertTagAsync(EditTagInput input);

/// <summary>
/// 更新标签
/// </summary>
/// <param name="id"></param>
/// <param name="input"></param>
/// <returns></returns>
Task<ServiceResult> UpdateTagAsync(int id, EditTagInput input);

/// <summary>
/// 删除标签
/// </summary>
/// <param name="id"></param>
/// <returns></returns>
Task<ServiceResult> DeleteTagAsync(int id);

#endregion Tags
```

查询标签列表需要返回的模型类`QueryTagForAdminDto.cs`。

```csharp
//QueryTagForAdminDto.cs
namespace Meowv.Blog.Application.Contracts.Blog
{
    public class QueryTagForAdminDto : QueryTagDto
    {
        /// <summary>
        /// 主键
        /// </summary>
        public int Id { get; set; }
    }
}
```

新增标签和更新标签需要的输入参数`EditTagInput.cs`，直接继承`TagDto`即可。

```csharp
//EditTagInput.cs
namespace Meowv.Blog.Application.Contracts.Blog.Params
{
    public class EditTagInput : TagDto
    {
    }
}
```

分别实现这几个接口。

```csharp
/// <summary>
/// 查询标签列表
/// </summary>
/// <returns></returns>
public async Task<ServiceResult<IEnumerable<QueryTagForAdminDto>>> QueryTagsForAdminAsync()
{
    var result = new ServiceResult<IEnumerable<QueryTagForAdminDto>>();

    var post_tags = await _postTagRepository.GetListAsync();

    var tags = _tagRepository.GetListAsync().Result.Select(x => new QueryTagForAdminDto
    {
        Id = x.Id,
        TagName = x.TagName,
        DisplayName = x.DisplayName,
        Count = post_tags.Count(p => p.TagId == x.Id)
    });

    result.IsSuccess(tags);
    return result;
}
```

```csharp
/// <summary>
/// 新增标签
/// </summary>
/// <param name="dto"></param>
/// <returns></returns>
public async Task<ServiceResult> InsertTagAsync(EditTagInput input)
{
    var result = new ServiceResult();

    var tag = ObjectMapper.Map<EditTagInput, Tag>(input);
    await _tagRepository.InsertAsync(tag);

    result.IsSuccess(ResponseText.INSERT_SUCCESS);
    return result;
}
```

这里需要一条 AutoMapper 配置，将`EditCategoryInput`转换为`Tag`，忽略 Id 字段。

```csharp
CreateMap<EditTagInput, Tag>().ForMember(x => x.Id, opt => opt.Ignore());
```

```csharp
/// <summary>
/// 更新标签
/// </summary>
/// <param name="id"></param>
/// <param name="dto"></param>
/// <returns></returns>
public async Task<ServiceResult> UpdateTagAsync(int id, EditTagInput input)
{
    var result = new ServiceResult();

    var tag = await _tagRepository.GetAsync(id);
    tag.TagName = input.TagName;
    tag.DisplayName = input.DisplayName;

    await _tagRepository.UpdateAsync(tag);

    result.IsSuccess(ResponseText.UPDATE_SUCCESS);
    return result;
}
```

```csharp
/// <summary>
/// 删除标签
/// </summary>
/// <param name="id"></param>
/// <returns></returns>
public async Task<ServiceResult> DeleteTagAsync(int id)
{
    var result = new ServiceResult();

    var tag = await _tagRepository.FindAsync(id);
    if (null == tag)
    {
        result.IsFailed(ResponseText.WHAT_NOT_EXIST.FormatWith("Id", id));
        return result;
    }

    await _tagRepository.DeleteAsync(id);
    await _postTagRepository.DeleteAsync(x => x.TagId == id);

    result.IsSuccess(ResponseText.DELETE_SUCCESS);
    return result;
}
```

在`BlogController.Admin.cs`中添加接口。

```csharp
#region Tags

/// <summary>
/// 查询标签列表
/// </summary>
/// <returns></returns>
[HttpGet]
[Authorize]
[Route("admin/tags")]
[ApiExplorerSettings(GroupName = Grouping.GroupName_v2)]
public async Task<ServiceResult<IEnumerable<QueryTagForAdminDto>>> QueryTagsForAdminAsync()
{
    return await _blogService.QueryTagsForAdminAsync();
}

/// <summary>
/// 新增标签
/// </summary>
/// <param name="input"></param>
/// <returns></returns>
[HttpPost]
[Authorize]
[Route("tag")]
[ApiExplorerSettings(GroupName = Grouping.GroupName_v2)]
public async Task<ServiceResult> InsertTagAsync([FromBody] EditTagInput input)
{
    return await _blogService.InsertTagAsync(input);
}

/// <summary>
/// 更新标签
/// </summary>
/// <param name="id"></param>
/// <param name="input"></param>
/// <returns></returns>
[HttpPut]
[Authorize]
[Route("tag")]
[ApiExplorerSettings(GroupName = Grouping.GroupName_v2)]
public async Task<ServiceResult> UpdateTagAsync([Required] int id, [FromBody] EditTagInput input)
{
    return await _blogService.UpdateTagAsync(id, input);
}

/// <summary>
/// 删除标签
/// </summary>
/// <param name="id"></param>
/// <returns></returns>
[HttpDelete]
[Authorize]
[Route("tag")]
[ApiExplorerSettings(GroupName = Grouping.GroupName_v2)]
public async Task<ServiceResult> DeleteTagAsync([Required] int id)
{
    return await _blogService.DeleteTagAsync(id);
}

#endregion Tags
```

![ ](/images/abp/blog-api-bestpractice-5-02.png)

## 友链

添加接口：查询友链列表`QueryFriendLinksForAdminAsync()`、新增友链`InsertFriendLinkAsync(...)`、更新友链`UpdateFriendLinkAsync(...)`、删除友链`DeleteFriendLinkAsync(...)`

```csharp
#region FriendLinks

/// <summary>
/// 查询友链列表
/// </summary>
/// <returns></returns>
Task<ServiceResult<IEnumerable<QueryFriendLinkForAdminDto>>> QueryFriendLinksForAdminAsync();

/// <summary>
/// 新增友链
/// </summary>
/// <param name="input"></param>
/// <returns></returns>
Task<ServiceResult> InsertFriendLinkAsync(EditFriendLinkInput input);

/// <summary>
/// 更新友链
/// </summary>
/// <param name="id"></param>
/// <param name="input"></param>
/// <returns></returns>
Task<ServiceResult> UpdateFriendLinkAsync(int id, EditFriendLinkInput input);

/// <summary>
/// 删除友链
/// </summary>
/// <param name="id"></param>
/// <returns></returns>
Task<ServiceResult> DeleteFriendLinkAsync(int id);

#endregion FriendLinks
```

查询友链列表需要返回的模型类`QueryFriendLinkForAdminDto.cs`。

```csharp
//QueryFriendLinkForAdminDto.cs
namespace Meowv.Blog.Application.Contracts.Blog
{
    public class QueryFriendLinkForAdminDto : FriendLinkDto
    {
        /// <summary>
        /// 主键
        /// </summary>
        public int Id { get; set; }
    }
}
```

新增友链和更新友链需要的输入参数`EditFriendLinkInput.cs`，直接继承`FriendLinkDto`即可。

```csharp
//EditFriendLinkInput .cs
namespace Meowv.Blog.Application.Contracts.Blog.Params
{
    public class EditFriendLinkInput : FriendLinkDto
    {
    }
}
```

分别实现这几个接口。

```csharp
/// <summary>
/// 查询友链列表
/// </summary>
/// <returns></returns>
public async Task<ServiceResult<IEnumerable<QueryFriendLinkForAdminDto>>> QueryFriendLinksForAdminAsync()
{
    var result = new ServiceResult<IEnumerable<QueryFriendLinkForAdminDto>>();

    var friendLinks = await _friendLinksRepository.GetListAsync();

    var dto = ObjectMapper.Map<List<FriendLink>, IEnumerable<QueryFriendLinkForAdminDto>>(friendLinks);

    result.IsSuccess(dto);
    return result;
}
```

```csharp
/// <summary>
/// 新增友链
/// </summary>
/// <param name="input"></param>
/// <returns></returns>
public async Task<ServiceResult> InsertFriendLinkAsync(EditFriendLinkInput input)
{
    var result = new ServiceResult();

    var friendLink = ObjectMapper.Map<EditFriendLinkInput, FriendLink>(input);
    await _friendLinksRepository.InsertAsync(friendLink);

    // 执行清除缓存操作
    await _blogCacheService.RemoveAsync(CachePrefix.Blog_FriendLink);

    result.IsSuccess(ResponseText.INSERT_SUCCESS);
    return result;
}
```

```csharp
/// <summary>
/// 更新友链
/// </summary>
/// <param name="id"></param>
/// <param name="input"></param>
/// <returns></returns>
public async Task<ServiceResult> UpdateFriendLinkAsync(int id, EditFriendLinkInput input)
{
    var result = new ServiceResult();

    var friendLink = await _friendLinksRepository.GetAsync(id);
    friendLink.Title = input.Title;
    friendLink.LinkUrl = input.LinkUrl;

    await _friendLinksRepository.UpdateAsync(friendLink);

    // 执行清除缓存操作
    await _blogCacheService.RemoveAsync(CachePrefix.Blog_FriendLink);

    result.IsSuccess(ResponseText.UPDATE_SUCCESS);
    return result;
}
```

```csharp
/// <summary>
/// 删除友链
/// </summary>
/// <param name="id"></param>
/// <returns></returns>
public async Task<ServiceResult> DeleteFriendLinkAsync(int id)
{
    var result = new ServiceResult();

    var friendLink = await _friendLinksRepository.FindAsync(id);
    if (null == friendLink)
    {
        result.IsFailed(ResponseText.WHAT_NOT_EXIST.FormatWith("Id", id));
        return result;
    }

    await _friendLinksRepository.DeleteAsync(id);

    // 执行清除缓存操作
    await _blogCacheService.RemoveAsync(CachePrefix.Blog_FriendLink);

    result.IsSuccess(ResponseText.DELETE_SUCCESS);
    return result;
}
```

其中查询友链列表和新增友链中有两条 AutoMapper 配置。

```csharp
CreateMap<FriendLink, QueryFriendLinkForAdminDto>();

CreateMap<EditFriendLinkInput, FriendLink>().ForMember(x => x.Id, opt => opt.Ignore());
```

在`BlogController.Admin.cs`中添加接口。

```csharp
#region FriendLinks

/// <summary>
/// 查询友链列表
/// </summary>
/// <returns></returns>
[HttpGet]
[Authorize]
[Route("admin/friendlinks")]
[ApiExplorerSettings(GroupName = Grouping.GroupName_v2)]
public async Task<ServiceResult<IEnumerable<QueryFriendLinkForAdminDto>>> QueryFriendLinksForAdminAsync()
{
    return await _blogService.QueryFriendLinksForAdminAsync();
}

/// <summary>
/// 新增友链
/// </summary>
/// <param name="input"></param>
/// <returns></returns>
[HttpPost]
[Authorize]
[Route("friendlink")]
[ApiExplorerSettings(GroupName = Grouping.GroupName_v2)]
public async Task<ServiceResult> InsertFriendLinkAsync([FromBody] EditFriendLinkInput input)
{
    return await _blogService.InsertFriendLinkAsync(input);
}

/// <summary>
/// 更新友链
/// </summary>
/// <param name="id"></param>
/// <param name="input"></param>
/// <returns></returns>
[HttpPut]
[Authorize]
[Route("friendlink")]
[ApiExplorerSettings(GroupName = Grouping.GroupName_v2)]
public async Task<ServiceResult> UpdateFriendLinkAsync([Required] int id, [FromBody] EditFriendLinkInput input)
{
    return await _blogService.UpdateFriendLinkAsync(id, input);
}

/// <summary>
/// 删除友链
/// </summary>
/// <param name="id"></param>
/// <returns></returns>
[HttpDelete]
[Authorize]
[Route("friendlink")]
[ApiExplorerSettings(GroupName = Grouping.GroupName_v2)]
public async Task<ServiceResult> DeleteFriendLinkAsync([Required] int id)
{
    return await _blogService.DeleteFriendLinkAsync(id);
}

#endregion
```

![ ](/images/abp/blog-api-bestpractice-5-03.png)

## Next

截止本篇，**基于 abp vNext 和 .NET Core 开发博客项目** 系列的后台 API 部分便全部开发完成了。

本博客项目系列是我一边写代码一边记录后的成果，并不是开发完成后再拿出来写的，涉及到东西也不是很多，对于新手入门来说应该是够了的，如果你从中有所收获请多多转发分享。

在此，希望大家可以关注一下我的微信公众号：『**阿星 Plus**』，文章将会首发在公众号中。

现在有了 API，大家可以选择自己熟悉的方式去开发前端界面，比如目前我博客的线上版本就是用的 ASP.NET Core Web ，感兴趣的可以去 `release` 分支查看。

关于前端部分，看到有人呼吁 vue，说实话前端技术不是很厉害，本职主要是后端开发，可能达不到预期效果。

所以我准备入坑 [Blazor](http://blazor.net/) 😂，接下来就现学现卖吧，一起学习一起做项目一起进步，加油 💪
