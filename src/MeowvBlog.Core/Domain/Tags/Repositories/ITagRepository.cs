using UPrime.Domain.Repositories;

namespace MeowvBlog.Core.Domain.Tags.Repositories
{
    /// <summary>
    /// 标签仓储接口
    /// </summary>
    public interface ITagRepository : IRepository<Tag, int> { }
}