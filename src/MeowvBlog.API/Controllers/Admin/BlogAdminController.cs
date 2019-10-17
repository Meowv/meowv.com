using MeowvBlog.Core;
using MeowvBlog.Core.Domain.Blog;
using MeowvBlog.Core.Dto;
using MeowvBlog.Core.Dto.Blog;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Linq;
using System.Threading.Tasks;

namespace MeowvBlog.API.Controllers.Admin
{
    [ApiController]
    [Route("Blog")]
    [Produces("application/json")]
    [ApiExplorerSettings(GroupName = GlobalConsts.GroupName_v2)]
    public class BlogAdminController : ControllerBase
    {
        private readonly MeowvBlogDBContext _context;

        public BlogAdminController(MeowvBlogDBContext context)
        {
            _context = context;
        }

        /// <summary>
        /// 新增文章
        /// </summary>
        /// <param name="dto"></param>
        /// <returns></returns>
        [HttpPost]
        [Route("post")]
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
    }
}