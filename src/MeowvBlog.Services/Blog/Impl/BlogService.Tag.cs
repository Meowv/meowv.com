using MeowvBlog.Core.Domain.Blog;
using MeowvBlog.Services.Dto.Blog;
using Plus;
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
    }
}