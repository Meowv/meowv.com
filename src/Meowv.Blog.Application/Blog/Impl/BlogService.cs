using Meowv.Blog.Caching.Blog;
using Meowv.Blog.Domain.Blog.Repositories;
using Meowv.Blog.Response;
using Microsoft.AspNetCore.Mvc;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace Meowv.Blog.Blog.Impl
{
    public partial class BlogService : ServiceBase, IBlogService
    {
        private readonly IPostRepository _posts;
        private readonly ICategoryRepository _categories;
        private readonly ITagRepository _tags;
        private readonly IFriendLinkRepository _friendLinks;
        private readonly IBlogCacheService _cache;

        public BlogService(IPostRepository posts,
                           ICategoryRepository categories,
                           ITagRepository tags,
                           IFriendLinkRepository friendLinks,
                           IBlogCacheService cache)
        {
            _posts = posts;
            _categories = categories;
            _tags = tags;
            _friendLinks = friendLinks;
            _cache = cache;
        }

        /// <summary>
        /// Get statistics on the total number of posts, categories and tags.
        /// </summary>
        /// <returns></returns>
        [Route("api/meowv/blog/statistics")]
        public async Task<BlogResponse<Tuple<int, int, int>>> GetStatisticsAsync()
        {
            var response = new BlogResponse<Tuple<int, int, int>>();

            var postCount = await _posts.GetCountAsync();
            var categoryCount = await _categories.GetCountAsync();
            var tagCount = await _tags.GetCountAsync();

            response.Result = new Tuple<int, int, int>(postCount.To<int>(), categoryCount.To<int>(), tagCount.To<int>());
            return response;
        }

        public async Task<List<PostModel>> GetPostsAsync()
        {
            var posts = await _posts.GetListAsync();

            return posts.OrderBy(x => x.CreatedAt).Select(x => new PostModel
            {
                Title = x.Title,
                Author = x.Author,
                Url = x.Url,
                Markdown = x.Markdown,
                Category = x.Category.Name,
                Tag = x.Tags.Select(t => t.Name).ToList(),
                CreatedAt = x.CreatedAt.ToLocalTime().ToString("yyyy-MM-dd HH:mm:dd")
            }).ToList();
        }
    }

    public class PostModel
    {
        public string Title { get; set; }

        public string Author { get; set; }

        public string Url { get; set; }

        public string Markdown { get; set; }

        public string Category { get; set; }

        public List<string> Tag { get; set; }

        public string CreatedAt { get; set; }
    }
}