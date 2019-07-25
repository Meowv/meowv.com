using MeowvBlog.Core.Domain.Blog;
using MeowvBlog.Core.Domain.Blog.Repositories;
using MeowvBlog.Services.Dto;
using MeowvBlog.Services.Dto.Blog;
using Plus;
using Plus.AutoMapper;
using Plus.Services.Dto;
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading.Tasks;

namespace MeowvBlog.Services.Blog.Impl
{
    public partial class BlogService : ServiceBase, IBlogService
    {
        private readonly IPostRepository _postRepository;
        private readonly ITagRepository _tagRepository;
        private readonly IPostTagRepository _postTagRepository;
        private readonly ICategoryRepository _categoryRepository;

        public BlogService(
            IPostRepository postRepository,
            ITagRepository tagRepository,
            IPostTagRepository postTagRepository,
            ICategoryRepository categoryRepository)
        {
            _postRepository = postRepository;
            _tagRepository = tagRepository;
            _postTagRepository = postTagRepository;
            _categoryRepository = categoryRepository;
        }

        /// <summary>
        /// 新增文章
        /// </summary>
        /// <param name="dto"></param>
        /// <returns></returns>
        public async Task<ActionOutput<string>> InsertPost(PostDto dto)
        {
            using (var uow = UnitOfWorkManager.Begin())
            {
                var output = new ActionOutput<string>();
                var post = new Post
                {
                    Title = dto.Title,
                    Author = dto.Author,
                    Url = dto.Url,
                    Content = dto.Content,
                    CreationTime = dto.CreationTime
                };

                var result = await _postRepository.InsertAsync(post);
                await uow.CompleteAsync();

                if (result.IsNull())
                    output.AddError("新增文章出错了~~~");
                else
                    output.Result = "success";

                return output;
            }
        }

        /// <summary>
        /// 删除文章
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        public async Task<ActionOutput<string>> DeletePost(int id)
        {
            using (var uow = UnitOfWorkManager.Begin())
            {
                var output = new ActionOutput<string>();

                await _postRepository.DeleteAsync(id);
                await uow.CompleteAsync();

                output.Result = "success";

                return output;
            }
        }

        /// <summary>
        /// 更新文章
        /// </summary>
        /// <param name="id"></param>
        /// <param name="dto"></param>
        /// <returns></returns>
        public async Task<ActionOutput<string>> UpdatePost(int id, PostDto dto)
        {
            using (var uow = UnitOfWorkManager.Begin())
            {
                var output = new ActionOutput<string>();

                var post = new Post
                {
                    Id = id,
                    Title = dto.Title,
                    Author = dto.Author,
                    Url = dto.Url,
                    Content = dto.Content,
                    CreationTime = dto.CreationTime
                };

                var result = await _postRepository.UpdateAsync(post);
                await uow.CompleteAsync();

                if (result.IsNull())
                    output.AddError("更新文章出错了~~~");
                else
                    output.Result = "success";

                return output;
            }
        }

        /// <summary>
        /// 获取文章
        /// </summary>
        /// <param name="url"></param>
        /// <returns></returns>
        public async Task<ActionOutput<GetPostDto>> GetPost(string url)
        {
            var output = new ActionOutput<GetPostDto>();

            var post = await _postRepository.FirstOrDefaultAsync(x => x.Url == url);
            if (post.IsNull())
            {
                output.AddError("找了找不到了~~~");
                return output;
            }

            var result = post.MapTo<GetPostDto>();
            result.CreationTime = Convert.ToDateTime(result.CreationTime).ToString("MMMM dd, yyyy HH:mm:ss", new CultureInfo("en-us"));

            output.Result = result;

            return output;
        }

        /// <summary>
        /// 分页查询文章列表
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        public async Task<PagedResultDto<QueryPostDto>> QueryPosts(PagingInput input)
        {
            var posts = await _postRepository.GetAllListAsync();

            var count = posts.Count;

            var list = posts.OrderByDescending(x => x.CreationTime).AsQueryable().PageByIndex(input.Page, input.Limit).ToList();

            var result = list.MapTo<IList<QueryPostDto>>().ToList();

            result.ForEach(x =>
            {
                x.CreationTime = Convert.ToDateTime(x.CreationTime).ToString("MMMM dd, yyyy HH:mm:ss", new CultureInfo("en-us"));
                x.Year = Convert.ToDateTime(x.CreationTime).Year;
            });

            return new PagedResultDto<QueryPostDto>(count, result);
        }

        /// <summary>
        /// 通过标签查询文章列表
        /// </summary>
        /// <param name="name"></param>
        /// <returns></returns>
        public async Task<IList<QueryPostDto>> QueryPostsByTag(string name)
        {
            return (from post_tags in await _postTagRepository.GetAllListAsync()
                    join tags in await _tagRepository.GetAllListAsync()
                    on post_tags.TagId equals tags.Id
                    join posts in await _postRepository.GetAllListAsync()
                    on post_tags.PostId equals posts.Id
                    where tags.DisplayName == name
                    orderby posts.CreationTime descending
                    select new QueryPostDto
                    {
                        Title = posts.Title,
                        Url = posts.Url,
                        CreationTime = posts.CreationTime?.ToString("MMMM dd, yyyy HH:mm:ss", new CultureInfo("en-us")),
                        Year = posts.CreationTime.Value.Year
                    }).ToList();
        }

        /// <summary>
        /// 通过分类查询文章列表
        /// </summary>
        /// <param name="name"></param>
        /// <returns></returns>
        public async Task<IList<QueryPostDto>> QueryPostsByCategory(string name)
        {
            return (from posts in await _postRepository.GetAllListAsync()
                    join categories in await _categoryRepository.GetAllListAsync()
                    on posts.CategoryId equals categories.Id
                    where categories.DisplayName == name
                    orderby posts.CreationTime descending
                    select new QueryPostDto
                    {
                        Title = posts.Title,
                        Url = posts.Url,
                        CreationTime = posts.CreationTime?.ToString("MMMM dd, yyyy HH:mm:ss", new CultureInfo("en-us")),
                        Year = posts.CreationTime.Value.Year
                    }).ToList();
        }
    }
}