using MeowvBlog.API.Configurations;
using MeowvBlog.API.Extensions;
using MeowvBlog.API.Models.Dto;
using MeowvBlog.API.Models.Dto.Blog;
using MeowvBlog.API.Models.Dto.Response;
using MeowvBlog.API.Models.Entity.Blog;
using MeowvBlog.Core.Dto.Blog;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace MeowvBlog.API.Controllers
{
    public partial class BlogController : ControllerBase
    {
        #region Posts

        /// <summary>
        /// 获取文章详细信息
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        [HttpGet]
        [Authorize]
        [Route("post/admin")]
        [ApiExplorerSettings(GroupName = GlobalConsts.GroupName_v2)]
        public async Task<Response<GetPostForAdminDto>> GetPostForAdminAsync(int id)
        {
            var response = new Response<GetPostForAdminDto>();

            var post = await _context.Posts.FindAsync(id);

            var tags = from post_tags in await _context.PostTags.ToListAsync()
                       join tag in await _context.Tags.ToListAsync()
                       on post_tags.TagId equals tag.Id
                       where post_tags.PostId.Equals(post.Id)
                       select tag.TagName;

            var result = new GetPostForAdminDto
            {
                Title = post.Title,
                Author = post.Author,
                Html = post.Html,
                Markdown = post.Markdown,
                CategoryId = post.CategoryId,
                CreationTime = post.CreationTime,
                Tags = string.Join(",", tags),
                Url = post.Url.Split("/").Where(x => !string.IsNullOrEmpty(x)).Last()
            };

            response.Result = result;
            return response;
        }

        /// <summary>
        /// 分页查询文章列表
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        [HttpGet]
        [Authorize]
        [Route("post/query/admin")]
        [ApiExplorerSettings(GroupName = GlobalConsts.GroupName_v2)]
        public async Task<PagedResponse<QueryPostForAdminDto>> QueryPostsForAdminAsync([FromQuery] PagingInput input)
        {
            var posts = await _context.Posts.ToListAsync();
            var count = posts.Count;

            var result = posts.OrderByDescending(x => x.CreationTime)
                              .Skip((input.Page - 1) * input.Limit)
                              .Take(input.Limit)
                              .Select(x => new PostBriefForAdminDto
                              {
                                  Id = x.Id,
                                  Title = x.Title,
                                  Url = x.Url,
                                  Year = x.CreationTime.Year,
                                  CreationTime = x.CreationTime.ToDateTimeForEn()
                              })
                              .GroupBy(x => x.Year)
                              .SelectToList(x => new QueryPostForAdminDto
                              {
                                  Year = x.Key,
                                  Posts = x.ToList()
                              });
            return new PagedResponse<QueryPostForAdminDto>(count, result);
        }

        /// <summary>
        /// 新增文章
        /// </summary>
        /// <param name="dto"></param>
        /// <returns></returns>
        [HttpPost]
        [Authorize]
        [Route("post")]
        [ApiExplorerSettings(GroupName = GlobalConsts.GroupName_v2)]
        public async Task<Response<string>> InsertPostAsync([FromBody] PostForAdminDto dto)
        {
            var response = new Response<string>();

            var post = new Post
            {
                Title = dto.Title,
                Author = dto.Author,
                Url = $"{dto.CreationTime.ToString(" yyyy MM dd ").Replace(" ", "/")}{dto.Url}/",
                Html = dto.Html,
                Markdown = dto.Markdown,
                CreationTime = dto.CreationTime,
                CategoryId = dto.CategoryId
            };
            await _context.Posts.AddAsync(post);
            await _context.SaveChangesAsync();

            var tags = await _context.Tags.ToListAsync();

            var newTags = dto.Tags.Where(item => !tags.Any(x => x.TagName.Equals(item))).SelectToList(item => new Tag
            {
                TagName = item,
                DisplayName = item
            });
            await _context.Tags.AddRangeAsync(newTags);
            await _context.SaveChangesAsync();

            var postTags = dto.Tags.SelectToList(item => new PostTag
            {
                PostId = post.Id,
                TagId = _context.Tags.FirstOrDefault(x => x.TagName == item).Id
            });
            await _context.PostTags.AddRangeAsync(postTags);
            await _context.SaveChangesAsync();

            response.Result = "新增成功";
            return response;
        }

        /// <summary>
        /// 更新文章
        /// </summary>
        /// <param name="id"></param>
        /// <param name="dto"></param>
        /// <returns></returns>
        [HttpPut]
        [Authorize]
        [Route("post")]
        [ApiExplorerSettings(GroupName = GlobalConsts.GroupName_v2)]
        public async Task<Response<string>> UpdatePostAsync(int id, PostForAdminDto dto)
        {
            var response = new Response<string>();

            var post = new Post
            {
                Id = id,
                Title = dto.Title,
                Author = dto.Author,
                Url = $"{dto.CreationTime.ToString(" yyyy MM dd ").Replace(" ", "/")}{dto.Url}/",
                Html = dto.Html,
                Markdown = dto.Markdown,
                CreationTime = dto.CreationTime,
                CategoryId = dto.CategoryId
            };
            _context.Posts.Update(post);
            await _context.SaveChangesAsync();

            var tags = await _context.Tags.ToListAsync();

            var oldPostTags = (from post_tags in await _context.PostTags.ToListAsync()
                               join tag in await _context.Tags.ToListAsync()
                               on post_tags.TagId equals tag.Id
                               where post_tags.PostId.Equals(post.Id)
                               select new
                               {
                                   post_tags.Id,
                                   tag.TagName
                               }).ToList();

            var removedIds = oldPostTags.Where(item => !dto.Tags.Any(x => x == item.TagName) && tags.Any(t => t.TagName == item.TagName)).SelectToList(item => item.Id);
            var removedPostTags = await _context.PostTags
                                                .Where(x => removedIds.Contains(x.Id))
                                                .ToListAsync();
            _context.PostTags.RemoveRange(removedPostTags);
            await _context.SaveChangesAsync();

            var newTags = dto.Tags
                             .Where(item => !tags.Any(x => x.TagName == item))
                             .SelectToList(item => new Tag
                             {
                                 TagName = item,
                                 DisplayName = item
                             });
            await _context.Tags.AddRangeAsync(newTags);
            await _context.SaveChangesAsync();

            var postTags = dto.Tags
                              .Where(item => !oldPostTags.Any(x => x.TagName == item))
                              .SelectToList(item => new PostTag
                              {
                                  PostId = id,
                                  TagId = _context.Tags.FirstOrDefault(x => x.TagName == item).Id
                              });
            await _context.PostTags.AddRangeAsync(postTags);
            await _context.SaveChangesAsync();

            response.Result = "更新成功";
            return response;
        }

        /// <summary>
        /// 删除文章
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        [HttpDelete]
        [Authorize]
        [Route("post")]
        [ApiExplorerSettings(GroupName = GlobalConsts.GroupName_v2)]
        public async Task<Response<string>> DeletePostAsync(int id)
        {
            var response = new Response<string>();

            var post = await _context.Posts.FindAsync(id);
            if (null == post)
            {
                response.Msg = $"ID：{id} 不存在";
                return response;
            }

            _context.Posts.Remove(post);
            await _context.SaveChangesAsync();

            response.Result = "删除成功";
            return response;
        }

        #endregion Posts

        #region Tags

        /// <summary>
        /// 查询标签列表
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Authorize]
        [Route("tags/admin")]
        [ApiExplorerSettings(GroupName = GlobalConsts.GroupName_v2)]
        public async Task<Response<IList<QueryTagForAdminDto>>> QueryTagsForAdminAsync()
        {
            var response = new Response<IList<QueryTagForAdminDto>>();
            var result = new List<QueryTagForAdminDto>();

            var post_tags = await _context.PostTags.ToListAsync();
            var tags = await _context.Tags.ToListAsync();
            tags.ForEach(x =>
            {
                result.Add(new QueryTagForAdminDto
                {
                    Id = x.Id,
                    TagName = x.TagName,
                    DisplayName = x.DisplayName,
                    Count = post_tags.Count(t => t.TagId == x.Id)
                });
            });

            response.Result = result;
            return response;
        }

        /// <summary>
        /// 新增标签
        /// </summary>
        /// <param name="dto"></param>
        /// <returns></returns>
        [HttpPost]
        [Authorize]
        [Route("tag")]
        [ApiExplorerSettings(GroupName = GlobalConsts.GroupName_v2)]
        public async Task<Response<string>> InsertTagAsync([FromBody] TagDto dto)
        {
            var response = new Response<string>();

            var tag = new Tag
            {
                TagName = dto.TagName,
                DisplayName = dto.DisplayName
            };
            await _context.Tags.AddAsync(tag);
            await _context.SaveChangesAsync();

            response.Result = "新增成功";
            return response;
        }

        /// <summary>
        /// 更新标签
        /// </summary>
        /// <param name="id"></param>
        /// <param name="dto"></param>
        /// <returns></returns>
        [HttpPut]
        [Authorize]
        [Route("tag")]
        [ApiExplorerSettings(GroupName = GlobalConsts.GroupName_v2)]
        public async Task<Response<string>> UpdateTagAsync(int id, [FromBody] TagDto dto)
        {
            var response = new Response<string>();

            var tag = new Tag
            {
                Id = id,
                TagName = dto.TagName,
                DisplayName = dto.DisplayName
            };
            _context.Tags.Update(tag);
            await _context.SaveChangesAsync();

            response.Result = "更新成功";
            return response;
        }

        /// <summary>
        /// 删除标签
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        [HttpDelete]
        [Authorize]
        [Route("tag")]
        [ApiExplorerSettings(GroupName = GlobalConsts.GroupName_v2)]
        public async Task<Response<string>> DeleteTagAsync(int id)
        {
            var response = new Response<string>();

            var tag = await _context.Tags.FindAsync(id);
            if (null == tag)
            {
                response.Msg = $"ID：{id} 不存在";
                return response;
            }

            _context.Tags.Remove(tag);
            await _context.SaveChangesAsync();

            response.Result = "删除成功";
            return response;
        }

        #endregion Tags

        #region Categories

        /// <summary>
        /// 查询分类列表
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Authorize]
        [Route("categories/admin")]
        [ApiExplorerSettings(GroupName = GlobalConsts.GroupName_v2)]
        public async Task<Response<IList<QueryCategoryForAdminDto>>> QueryCategoriesForAdminAsync()
        {
            var response = new Response<IList<QueryCategoryForAdminDto>>();
            var result = new List<QueryCategoryForAdminDto>();

            var posts = await _context.Posts.ToListAsync();
            var categories = await _context.Categories.ToListAsync();
            categories.ForEach(x =>
            {
                result.Add(new QueryCategoryForAdminDto
                {
                    Id = x.Id,
                    CategoryName = x.CategoryName,
                    DisplayName = x.DisplayName,
                    Count = posts.Count(p => p.CategoryId == x.Id)
                });
            });

            response.Result = result;
            return response;
        }

        /// <summary>
        /// 新增分类
        /// </summary>
        /// <param name="dto"></param>
        /// <returns></returns>
        [HttpPost]
        [Authorize]
        [Route("category")]
        [ApiExplorerSettings(GroupName = GlobalConsts.GroupName_v2)]
        public async Task<Response<string>> InsertCategoryAsync([FromBody] CategoryDto dto)
        {
            var response = new Response<string>();

            var category = new Category
            {
                CategoryName = dto.CategoryName,
                DisplayName = dto.DisplayName
            };
            await _context.Categories.AddAsync(category);
            await _context.SaveChangesAsync();

            response.Result = "新增成功";
            return response;
        }

        /// <summary>
        /// 更新分类
        /// </summary>
        /// <param name="id"></param>
        /// <param name="dto"></param>
        /// <returns></returns>
        [HttpPut]
        [Authorize]
        [Route("category")]
        [ApiExplorerSettings(GroupName = GlobalConsts.GroupName_v2)]
        public async Task<Response<string>> UpdateCategoryAsync(int id, [FromBody] CategoryDto dto)
        {
            var response = new Response<string>();

            var category = new Category
            {
                Id = id,
                CategoryName = dto.CategoryName,
                DisplayName = dto.DisplayName
            };

            _context.Categories.Update(category);
            await _context.SaveChangesAsync();

            response.Result = "更新成功";
            return response;
        }

        /// <summary>
        /// 删除分类
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        [HttpDelete]
        [Authorize]
        [Route("category")]
        [ApiExplorerSettings(GroupName = GlobalConsts.GroupName_v2)]
        public async Task<Response<string>> DeleteCategoryAsync(int id)
        {
            var response = new Response<string>();

            var tag = await _context.Categories.FindAsync(id);
            if (null == tag)
            {
                response.Msg = $"ID：{id} 不存在";
                return response;
            }

            _context.Categories.Remove(tag);
            await _context.SaveChangesAsync();

            response.Result = "删除成功";
            return response;
        }

        #endregion Categories

        #region FriendLink

        /// <summary>
        /// 新增友链
        /// </summary>
        /// <param name="dto"></param>
        /// <returns></returns>
        [HttpPost]
        [Authorize]
        [Route("friendlink")]
        [ApiExplorerSettings(GroupName = GlobalConsts.GroupName_v2)]
        public async Task<Response<string>> InsertFriendLinkAsync(FriendLinkDto dto)
        {
            var response = new Response<string>();

            var friendLink = new FriendLink
            {
                Title = dto.Title,
                LinkUrl = dto.LinkUrl
            };
            await _context.FriendLinks.AddAsync(friendLink);
            await _context.SaveChangesAsync();

            response.Result = "新增成功";
            return response;
        }

        #endregion FriendLink
    }
}