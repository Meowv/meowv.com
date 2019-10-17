using MeowvBlog.Core;
using MeowvBlog.Core.Domain.Blog;
using MeowvBlog.Core.Dto;
using MeowvBlog.Core.Dto.Blog;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Collections.Generic;
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
            var newTags = new List<Tag>();
            foreach (var item in dto.Tags)
            {
                if (!tags.Any(x => x.TagName.Equals(item)))
                {
                    newTags.Add(new Tag
                    {
                        TagName = item,
                        DisplayName = item
                    });
                }
            }
            await _context.Tags.AddRangeAsync(newTags);
            await _context.SaveChangesAsync();

            var postTags = new List<PostTag>();
            foreach (var item in dto.Tags)
            {
                postTags.Add(new PostTag
                {
                    PostId = post.Id,
                    TagId = _context.Tags.FirstOrDefault(x => x.TagName == item).Id
                });
            }
            await _context.PostTags.AddRangeAsync(postTags);
            await _context.SaveChangesAsync();

            response.Result = "新增成功";
            return response;
        }
    }
}