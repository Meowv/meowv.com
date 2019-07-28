using Plus.Domain.Repositories;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace MeowvBlog.Core.Domain.Blog.Repositories
{
    public interface ITagRepository : IRepository<Tag, int>
    {
        Task<bool> BulkInsertTagsAsync(List<Tag> tags);
    }
}