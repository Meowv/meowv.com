﻿using MeowvBlog.Core.Domain.Articles;
using MeowvBlog.Core.Domain.Articles.Repositories;
using MeowvBlog.Services.Dto.Articles.Params;
using MeowvBlog.Services.Dto.Common;
using System;
using System.Threading.Tasks;
using UPrime;

namespace MeowvBlog.Services.Articles.Impl
{
    /// <summary>
    /// 文章服务接口实现
    /// </summary>
    public class ArticleService : ServiceBase, IArticleService
    {
        private readonly IArticleRepository _articleRepository;

        public ArticleService(IArticleRepository articleRepository)
        {
            _articleRepository = articleRepository;
        }

        /// <summary>
        /// 新增文章
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        public async Task<ActionOutput<string>> InsertAsync(InsertArticleInput input)
        {
            var output = new ActionOutput<string>();

            using (var uow = UnitOfWorkManager.Begin())
            {
                var entity = new Article
                {
                    Title = input.Title,
                    Author = input.Author,
                    Source = input.Source,
                    Url = input.Url,
                    Summary = input.Summary,
                    Content = input.Content,
                    Hits = 0,
                    MetaKeywords = input.MetaKeywords,
                    MetaDescription = input.MetaDescription,
                    CreationTime = DateTime.Now,
                    PostTime = input.PostTime,
                    IsDeleted = false
                };
                await _articleRepository.InsertAsync(entity);

                output.Result = "新增成功";

                await uow.CompleteAsync();
            }
            return output;
        }

        /// <summary>
        /// 更新文章
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        public async Task<ActionOutput<string>> UpdateAsync(UpdateArticleInput input)
        {
            var output = new ActionOutput<string>();

            using (var uow = UnitOfWorkManager.Begin())
            {
                var entity = await _articleRepository.GetAsync(input.ArticleId);
                entity.Title = input.Title;
                entity.Author = input.Author;
                entity.Source = input.Source;
                entity.Url = input.Url;
                entity.Summary = input.Summary;
                entity.Content = input.Content;
                entity.MetaKeywords = input.MetaKeywords;
                entity.MetaDescription = input.MetaDescription;
                entity.PostTime = input.PostTime;
                await _articleRepository.UpdateAsync(entity);

                output.Result = "更新成功";

                await uow.CompleteAsync();
            }
            return output;
        }

        /// <summary>
        /// 删除文章
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        public async Task<ActionOutput<string>> DeleteAsync(DeleteInput input)
        {
            var output = new ActionOutput<string>();
            using (var uow = UnitOfWorkManager.Begin())
            {
                //await _articleRepository.DeleteAsync(input.Id);

                var entity = await _articleRepository.GetAsync(input.Id);
                entity.IsDeleted = true;
                await _articleRepository.UpdateAsync(entity);

                output.Result = "删除成功";

                await uow.CompleteAsync();
            }

            return output;
        }
    }
}