using Meowv.Blog.Domain.Blog;
using Meowv.Blog.Dto.Blog;
using Meowv.Blog.Response;
using Microsoft.AspNetCore.Mvc;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using System.Threading.Tasks;

namespace Meowv.Blog.Blog.Impl
{
    public partial class BlogService
    {
        /// <summary>
        /// Get post by url.
        /// </summary>
        /// <param name="url"></param>
        /// <returns></returns>
        [Route("api/meowv/blog/post")]
        public async Task<BlogResponse<PostDetailDto>> GetPostByUrlAsync(string url)
        {
            return await _cache.GetPostByUrlAsync(url, async () =>
            {
                var response = new BlogResponse<PostDetailDto>();

                var post = await _posts.FindAsync(x => x.Url == url);
                if (post is null)
                {
                    response.IsFailed($"The post url not exists.");
                    return response;
                }

                var previous = _posts.Where(x => x.CreatedAt > post.CreatedAt).Take(1).Select(x => new PostPagedDto
                {
                    Title = x.Title,
                    Url = x.Url
                }).FirstOrDefault();
                var next = _posts.Where(x => x.CreatedAt < post.CreatedAt).OrderByDescending(x => x.CreatedAt).Take(1).Select(x => new PostPagedDto
                {
                    Title = x.Title,
                    Url = x.Url
                }).FirstOrDefault();

                var result = ObjectMapper.Map<Post, PostDetailDto>(post);
                result.Previous = previous;
                result.Next = next;

                response.Result = result;
                return response;
            });
        }

        /// <summary>
        /// Get the list of posts by paging.
        /// </summary>
        /// <param name="page"></param>
        /// <param name="limit"></param>
        /// <returns></returns>
        [Route("api/meowv/blog/posts/{page}/{limit}")]
        public async Task<BlogResponse<PagedList<GetPostDto>>> GetPostsAsync([Range(1, 100)] int page = 1, [Range(10, 100)] int limit = 10)
        {
            return await _cache.GetPostsAsync(page, limit, async () =>
            {
                var response = new BlogResponse<PagedList<GetPostDto>>();

                var result = await _posts.GetPagedListAsync(page, limit);
                var total = result.Item1;
                var posts = GetPostList(result.Item2);

                response.Result = new PagedList<GetPostDto>(total, posts);
                return response;
            });
        }

        /// <summary>
        /// Get the list of posts by category.
        /// </summary>
        /// <param name="category"></param>
        /// <returns></returns>
        [Route("api/meowv/blog/posts/category/{category}")]
        public async Task<BlogResponse<List<GetPostDto>>> GetPostsByCategoryAsync(string category)
        {
            return await _cache.GetPostsByCategoryAsync(category, async () =>
            {
                var response = new BlogResponse<List<GetPostDto>>();

                var entity = await _categories.FindAsync(x => x.Alias == category);
                if (entity is null)
                {
                    response.IsFailed($"The category:{category} not exists.");
                    return response;
                }

                var posts = await _posts.GetListByCategoryAsync(category);

                response.IsSuccess(GetPostList(posts), entity.Name);
                return response;
            });
        }

        /// <summary>
        /// Get the list of posts by tag.
        /// </summary>
        /// <param name="tag"></param>
        /// <returns></returns>
        [Route("api/meowv/blog/posts/tag/{tag}")]
        public async Task<BlogResponse<List<GetPostDto>>> GetPostsByTagAsync(string tag)
        {
            return await _cache.GetPostsByTagAsync(tag, async () =>
            {
                var response = new BlogResponse<List<GetPostDto>>();

                var entity = await _tags.FindAsync(x => x.Alias == tag);
                if (entity is null)
                {
                    response.IsFailed($"The tag:{tag} not exists.");
                    return response;
                }

                var posts = await _posts.GetListByTagAsync(tag);

                response.IsSuccess(GetPostList(posts), entity.Name);
                return response;
            });
        }

        private List<GetPostDto> GetPostList(List<Post> posts) =>
            ObjectMapper.Map<List<Post>, List<PostBriefDto>>(posts)
                        .GroupBy(x => x.Year)
                        .Select(x => new GetPostDto
                        {
                            Year = x.Key,
                            Posts = x
                        }).ToList();
    }
}