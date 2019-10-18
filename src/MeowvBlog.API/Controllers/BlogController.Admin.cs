using MeowvBlog.Core;
using MeowvBlog.Core.Domain.Blog;
using MeowvBlog.Core.Dto;
using MeowvBlog.Core.Dto.Blog;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Globalization;
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
                                  Year = Convert.ToDateTime(x.CreationTime).Year,
                                  CreationTime = Convert.ToDateTime(x.CreationTime).ToString("MMMM dd, yyyy HH:mm:ss", new CultureInfo("en-us"))
                              })
                              .GroupBy(x => x.Year)
                              .Select(x => new QueryPostForAdminDto
                              {
                                  Year = x.Key,
                                  Posts = x.ToList()
                              }).ToList();

            return new PagedResponse<QueryPostForAdminDto>(count, result);
        }

        /// <summary>
        /// 新增文章
        /// </summary>
        /// <param name="dto"></param>
        /// <returns></returns>
        [HttpPost]
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

            var newTags = dto.Tags.Where(item => !tags.Any(x => x.TagName.Equals(item))).Select(item => new Tag
            {
                TagName = item,
                DisplayName = item
            }).ToList();
            await _context.Tags.AddRangeAsync(newTags);
            await _context.SaveChangesAsync();

            var postTags = dto.Tags.Select(item => new PostTag
            {
                PostId = post.Id,
                TagId = _context.Tags.FirstOrDefault(x => x.TagName == item).Id
            }).ToList();
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

            var removedIds = oldPostTags.Where(item => !dto.Tags.Any(x => x == item.TagName) && tags.Any(t => t.TagName == item.TagName)).Select(item => item.Id).ToList();
            var removedPostTags = await _context.PostTags.Where(x => removedIds.Contains(x.Id)).ToListAsync();
            _context.PostTags.RemoveRange(removedPostTags);
            await _context.SaveChangesAsync();

            var newTags = dto.Tags.Where(item => !tags.Any(x => x.TagName == item)).Select(item => new Tag
            {
                TagName = item,
                DisplayName = item
            }).ToList();
            await _context.Tags.AddRangeAsync(newTags);
            await _context.SaveChangesAsync();

            var postTags = dto.Tags.Where(item => !oldPostTags.Any(x => x.TagName == item)).Select(item => new PostTag
            {
                PostId = id,
                TagId = _context.Tags.FirstOrDefault(x => x.TagName == item).Id
            }).ToList();
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
        [Route("tags/admin")]
        [ApiExplorerSettings(GroupName = GlobalConsts.GroupName_v2)]
        public async Task<Response<IList<QueryTagForAdminDto>>> QueryTagsForAdminAsync()
        {
            return new Response<IList<QueryTagForAdminDto>>
            {
                Result = (from tags in await _context.Tags.ToListAsync()
                          join post_tags in await _context.PostTags.ToListAsync()
                          on tags.Id equals post_tags.TagId
                          group tags by new
                          {
                              tags.Id,
                              tags.TagName,
                              tags.DisplayName
                          } into g
                          select new QueryTagForAdminDto
                          {
                              Id = g.Key.Id,
                              TagName = g.Key.TagName,
                              DisplayName = g.Key.DisplayName,
                              Count = g.Count()
                          }).ToList()
            };
        }

        #endregion
    }
}