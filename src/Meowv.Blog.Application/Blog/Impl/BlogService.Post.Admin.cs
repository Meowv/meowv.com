using Meowv.Blog.Domain.Blog;
using Meowv.Blog.Dto.Blog;
using Meowv.Blog.Dto.Blog.Params;
using Meowv.Blog.Extensions;
using Meowv.Blog.Response;
using Microsoft.AspNetCore.Authorization;
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
        /// Create a post.
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        [Authorize]
        [Route("api/meowv/blog/post")]
        public async Task<BlogResponse> CreatePostAsync(CreatePostInput input)
        {
            var response = new BlogResponse();

            var tags = await _tags.GetListAsync();
            var newTags = input.Tags.Where(item => !tags.Any(x => x.Name == item)).Select(x => new Tag
            {
                Name = x,
                Alias = x.ToLower()
            });
            if (newTags.Any())
            {
                await _tags.InsertManyAsync(newTags);
            }

            var post = new Post
            {
                Title = input.Title,
                Author = input.Author,
                Url = input.Url.GeneratePostUrl(input.CreatedAt.ToDateTime()),
                Markdown = input.Markdown,
                Category = await _categories.GetAsync(input.CategoryId.ToObjectId()),
                Tags = await _tags.GetListAsync(input.Tags),
                CreatedAt = input.CreatedAt.ToDateTime()
            };
            await _posts.InsertAsync(post);

            return response;
        }

        /// <summary>
        /// Delete post by id.
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        [Authorize]
        [Route("api/meowv/blog/post/{id}")]
        public async Task<BlogResponse> DeletePostAsync(string id)
        {
            var response = new BlogResponse();

            var post = await _posts.FindAsync(id.ToObjectId());
            if (post is null)
            {
                response.IsFailed($"The post id not exists.");
                return response;
            }

            await _posts.DeleteAsync(id.ToObjectId());

            return response;
        }

        /// <summary>
        /// Update post by id.
        /// </summary>
        /// <param name="id"></param>
        /// <param name="input"></param>
        /// <returns></returns>
        [Authorize]
        [Route("api/meowv/blog/post/{id}")]
        public async Task<BlogResponse> UpdatePostAsync(string id, UpdatePostInput input)
        {
            var response = new BlogResponse();

            var post = await _posts.FindAsync(id.ToObjectId());
            if (post is null)
            {
                response.IsFailed($"The post id not exists.");
                return response;
            }

            var tags = await _tags.GetListAsync();
            var newTags = input.Tags.Where(item => !tags.Any(x => x.Name == item)).Select(x => new Tag
            {
                Name = x,
                Alias = x.ToLower()
            });
            if (newTags.Any())
            {
                await _tags.InsertManyAsync(newTags);
            }

            post.Title = input.Title;
            post.Author = input.Author;
            post.Url = input.Url.GeneratePostUrl(input.CreatedAt.ToDateTime());
            post.Markdown = input.Markdown;
            post.Category = await _categories.GetAsync(input.CategoryId.ToObjectId());
            post.Tags = await _tags.GetListAsync(input.Tags);
            post.CreatedAt = input.CreatedAt.ToDateTime();
            await _posts.UpdateAsync(post);

            return response;
        }

        /// <summary>
        /// Get post by id.
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        [Authorize]
        [Route("api/meowv/blog/post/{id}")]
        public async Task<BlogResponse<PostDto>> GetPostAsync(string id)
        {
            var response = new BlogResponse<PostDto>();

            var post = await _posts.FindAsync(id.ToObjectId());
            if (post is null)
            {
                response.IsFailed($"The post id not exists.");
                return response;
            }

            var result = ObjectMapper.Map<Post, PostDto>(post);
            result.Url = result.Url.Split("-").Last();

            response.Result = result;
            return response;
        }

        /// <summary>
        /// Get the list of posts by paging.
        /// </summary>
        /// <param name="page"></param>
        /// <param name="limit"></param>
        /// <returns></returns>
        [Authorize]
        [Route("api/meowv/blog/admin/posts/{page}/{limit}")]
        public async Task<BlogResponse<PagedList<GetAdminPostDto>>> GetAdminPostsAsync([Range(1, 100)] int page = 1, [Range(10, 100)] int limit = 10)
        {
            var response = new BlogResponse<PagedList<GetAdminPostDto>>();

            var result = await _posts.GetPagedListAsync(page, limit);
            var total = result.Item1;
            var posts = ObjectMapper.Map<List<Post>, List<GetAdminPostDto>>(result.Item2);

            response.Result = new PagedList<GetAdminPostDto>(total, posts);
            return response;
        }
    }
}