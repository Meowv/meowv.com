using MeowvBlog.Core.Domain;
using MeowvBlog.Core.Domain.Tags;
using MeowvBlog.Core.Domain.Tags.Repositories;
using MeowvBlog.Services.Dto.Common;
using MeowvBlog.Services.Dto.Tags;
using MeowvBlog.Services.Dto.Tags.Params;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using UPrime;
using UPrime.AutoMapper;

namespace MeowvBlog.Services.Tags.Impl
{
    /// <summary>
    /// 标签服务接口实现
    /// </summary>
    public class TagService : ServiceBase, ITagService
    {
        private readonly ITagRepository _tagRepository;

        public TagService(ITagRepository tagRepository)
        {
            _tagRepository = tagRepository;
        }

        /// <summary>
        /// 所有标签列表
        /// </summary>
        /// <returns></returns>
        public async Task<ActionOutput<IList<TagDto>>> GetAsync()
        {
            var output = new ActionOutput<IList<TagDto>>();

            using (var uow = UnitOfWorkManager.Begin())
            {
                var list = await _tagRepository.GetAllListAsync();

                await uow.CompleteAsync();

                var result = list.MapTo<IList<TagDto>>();

                output.Result = result;
            }
            return output;
        }

        /// <summary>
        /// 标签列表
        /// </summary>
        /// <param name="count"></param>
        /// <returns></returns>
        public async Task<ActionOutput<IList<TagDto>>> GetAsync(int count)
        {
            var output = new ActionOutput<IList<TagDto>>();

            using (var uow = UnitOfWorkManager.Begin())
            {
                var list = await _tagRepository.GetAllListAsync();
                list = list.Take(count).ToList();

                await uow.CompleteAsync();

                var result = list.MapTo<IList<TagDto>>();

                output.Result = result;
            }
            return output;
        }

        /// <summary>
        /// 新增标签
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        public async Task<ActionOutput<string>> InsertAsync(TagDto input)
        {
            var output = new ActionOutput<string>();

            using (var uow = UnitOfWorkManager.Begin())
            {
                var entity = new Tag
                {
                    TagName = input.TagName,
                    DisplayName = input.DisplayName,
                    CreationTime = DateTime.Now
                };
                await _tagRepository.InsertAsync(entity);

                output.Result = GlobalConsts.INSERT_SUCCESS;

                await uow.CompleteAsync();
            }
            return output;
        }

        /// <summary>
        /// 更新标签
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        public async Task<ActionOutput<string>> UpdateAsync(UpdateTagInput input)
        {
            var output = new ActionOutput<string>();

            using (var uow = UnitOfWorkManager.Begin())
            {
                var entity = await _tagRepository.GetAsync(input.TagId);
                entity.TagName = input.TagName;
                entity.DisplayName = input.DisplayName;
                await _tagRepository.UpdateAsync(entity);

                output.Result = GlobalConsts.UPDATE_SUCCESS;

                await uow.CompleteAsync();
            }
            return output;
        }

        /// <summary>
        /// 删除标签
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        public async Task<ActionOutput<string>> DeleteAsync(DeleteInput input)
        {
            var output = new ActionOutput<string>();

            using (var uow = UnitOfWorkManager.Begin())
            {
                await _tagRepository.DeleteAsync(input.Id);

                output.Result = GlobalConsts.DELETE_SUCCESS;

                await uow.CompleteAsync();
            }
            return output;
        }
    }
}