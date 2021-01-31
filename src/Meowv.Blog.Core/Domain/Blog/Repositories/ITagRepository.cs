using MongoDB.Bson;
using System.Collections.Generic;
using System.Threading.Tasks;
using Volo.Abp.Domain.Repositories;

namespace Meowv.Blog.Domain.Blog.Repositories
{
    public interface ITagRepository : IRepository<Tag, ObjectId>
    {
        /// <summary>
        /// Get tag list by names
        /// </summary>
        /// <param name="names"></param>
        /// <returns></returns>
        Task<List<Tag>> GetListAsync(List<string> names);
    }
}