using MeowvBlog.Core.Domain.Tags;
using MeowvBlog.Core.Domain.Tags.Repositories;

namespace MeowvBlog.EntityFramework.Repositories.Tags
{
    /// <summary>
    /// 标签仓储接口实现
    /// </summary>
    public class TagRepository : MeowvBlogRepositoryBase<Tag>, ITagRepository
    {
        public TagRepository(MeowvBlogDbContextProvider dbContextProvider) : base(dbContextProvider)
        {
        }
    }
}