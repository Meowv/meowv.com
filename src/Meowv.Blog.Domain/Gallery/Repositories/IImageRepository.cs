using System;
using Volo.Abp.Domain.Repositories;

namespace Meowv.Blog.Domain.Gallery.Repositories
{
    public interface IImageRepository : IRepository<Image, Guid>
    {
    }
}