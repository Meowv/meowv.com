using System;
using Volo.Abp.Domain.Repositories;

namespace Meowv.Blog.Domain.HotNews.Repositories
{
    /// <summary>
    /// IHotNewsRepository
    /// </summary>
    public interface IHotNewsRepository : IRepository<HotNews, Guid>
    {
    }
}