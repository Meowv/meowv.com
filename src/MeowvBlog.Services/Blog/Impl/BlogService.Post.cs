﻿using MeowvBlog.Core.Domain.Blog;
using MeowvBlog.Core.Domain.Blog.Repositories;
using MeowvBlog.Services.Dto.Blog;
using Plus;
using Plus.AutoMapper;
using System;
using System.Globalization;
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
        public async Task<ActionOutput<string>> Insert(PostDto dto)
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
        public async Task<ActionOutput<string>> Delete(int id)
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
        public async Task<ActionOutput<string>> Update(int id, PostDto dto)
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
        public async Task<ActionOutput<GetPostDto>> Get(string url)
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
    }
}