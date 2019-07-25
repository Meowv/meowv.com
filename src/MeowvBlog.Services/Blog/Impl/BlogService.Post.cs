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

        public BlogService(IPostRepository postRepository)
        {
            _postRepository = postRepository;
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
        public async Task<PagedResultDto<QueryPostDto>> QueryPost(PagingInput input)
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
    }
}