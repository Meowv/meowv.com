using Meowv.Blog.ToolKits.Base;
using System.Threading.Tasks;

namespace Meowv.Blog.Application.Blog.Impl
{
    public partial class BlogService
    {
        /// <summary>
        /// 获取标签名称
        /// </summary>
        /// <param name="name"></param>
        /// <returns></returns>
        public async Task<ServiceResult<string>> GetTagAsync(string name)
        {
            return await _blogCacheService.GetTagAsync(name, async () =>
            {
                var result = new ServiceResult<string>();

                var tag = await _tagRepository.FindAsync(x => x.DisplayName.Equals(name));
                if (null == tag)
                {
                    result.IsFailed($"标签：{name} 不存在");
                    return result;
                }

                result.IsSuccess(tag.TagName);
                return result;
            });
        }
    }
}