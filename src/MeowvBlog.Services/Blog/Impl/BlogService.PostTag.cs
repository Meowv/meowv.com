using MeowvBlog.Core.Domain.Blog;
using MeowvBlog.Services.Dto.Blog;
using Plus;
using System.Threading.Tasks;

namespace MeowvBlog.Services.Blog.Impl
{
    public partial class BlogService
    {
        /// <summary>
        /// 新增文章的标签
        /// </summary>
        /// <param name="dto"></param>
        /// <returns></returns>
        public async Task<ActionOutput<string>> InsertPostTag(PostTagDto dto)
        {
            using (var uow = UnitOfWorkManager.Begin())
            {
                var output = new ActionOutput<string>();

                var postTag = new PostTag
                {
                    PostId = dto.PostId,
                    TagId = dto.TagId
                };

                var result = await _postTagRepository.InsertAsync(postTag);
                await uow.CompleteAsync();

                if (result.IsNull())
                    output.AddError("新增文章的标签出错了~~~");
                else
                    output.Result = "success";

                return output;
            }
        }

        /// <summary>
        /// 删除文章的标签
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        public async Task<ActionOutput<string>> DeletePostTag(int id)
        {
            using (var uow = UnitOfWorkManager.Begin())
            {
                var output = new ActionOutput<string>();

                await _postTagRepository.DeleteAsync(id);
                await uow.CompleteAsync();

                output.Result = "success";

                return output;
            }
        }
    }
}