using MeowvBlog.Core.Domain.Blog;
using MeowvBlog.Services.Dto.Blog;
using Plus;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace MeowvBlog.Services.Blog.Impl
{
    public partial class BlogService
    {
        /// <summary>
        /// 新增标签
        /// </summary>
        /// <param name="dto"></param>
        /// <returns></returns>
        public async Task<ActionOutput<string>> InsertTag(TagDto dto)
        {
            using (var uow = UnitOfWorkManager.Begin())
            {
                var output = new ActionOutput<string>();

                var tag = new Tag
                {
                    TagName = dto.TagName,
                    DisplayName = dto.DisplayName
                };

                var result = await _tagRepository.InsertAsync(tag);
                await uow.CompleteAsync();

                if (result.IsNull())
                    output.AddError("新增标签出错了~~~");
                else
                    output.Result = "success";

                return output;
            }
        }

        /// <summary>
        /// 删除标签
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        public async Task<ActionOutput<string>> DeleteTag(int id)
        {
            using (var uow = UnitOfWorkManager.Begin())
            {
                var output = new ActionOutput<string>();

                await _tagRepository.DeleteAsync(id);
                await uow.CompleteAsync();

                output.Result = "success";

                return output;
            }
        }

        /// <summary>
        /// 更新标签
        /// </summary>
        /// <param name="id"></param>
        /// <param name="dto"></param>
        /// <returns></returns>
        public async Task<ActionOutput<string>> UpdateTag(int id, TagDto dto)
        {
            using (var uow = UnitOfWorkManager.Begin())
            {
                var output = new ActionOutput<string>();

                var tag = new Tag
                {
                    Id = id,
                    TagName = dto.TagName,
                    DisplayName = dto.DisplayName
                };

                var result = await _tagRepository.UpdateAsync(tag);
                await uow.CompleteAsync();

                if (result.IsNull())
                    output.AddError("更新标签出错了~~~");
                else
                    output.Result = "success";

                return output;
            }
        }

        /// <summary>
        /// 查询标签列表
        /// </summary>
        /// <returns></returns>
        public async Task<IList<QueryTagDto>> QueryTags()
        {
            //var sql = @"SELECT
            //             tags.TagName,
            //             tags.DisplayName,
            //             Count( 1 ) AS Count 
            //            FROM
            //             post_tags
            //             INNER JOIN tags ON tags.Id = post_tags.TagId
            //            GROUP BY
            //             tags.TagName,
            //             tags.DisplayName";

            return (from tags in await _tagRepository.GetAllListAsync()
                    join post_tags in await _postTagRepository.GetAllListAsync()
                    on tags.Id equals post_tags.TagId
                    group tags by new
                    {
                        tags.TagName,
                        tags.DisplayName
                    }
                    into g
                    select new QueryTagDto
                    {
                        TagName = g.Key.TagName,
                        DisplayName = g.Key.DisplayName,
                        Count = g.Count()
                    }).ToList();
        }
    }
}