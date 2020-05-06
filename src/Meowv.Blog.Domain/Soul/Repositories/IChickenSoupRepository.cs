using System;
using Volo.Abp.Domain.Repositories;

namespace Meowv.Blog.Domain.Soul.Repositories
{
    public interface IChickenSoupRepository : IRepository<ChickenSoup, Guid>
    {
    }
}