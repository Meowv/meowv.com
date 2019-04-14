using UPrime.Domain.Repositories;

namespace MeowvBlog.Core.Domain.Categories.Repositories
{
    /// <summary>
    /// 分类仓储接口
    /// </summary>
    public interface ICategoryRepository : IRepository<Category, int> { }
}