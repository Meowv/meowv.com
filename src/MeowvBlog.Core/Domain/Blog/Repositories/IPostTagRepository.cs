using Plus.Domain.Repositories;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace MeowvBlog.Core.Domain.Blog.Repositories
{
    public interface IPostTagRepository : IRepository<PostTag, int>
    {
        Task<bool> BulkInsertPostTagsAsync(List<PostTag> postTags);
    }
}