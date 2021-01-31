using MongoDB.Bson;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Volo.Abp.Domain.Repositories;

namespace Meowv.Blog.Domain.Sayings.Repositories
{
    public interface ISayingRepository : IRepository<Saying, ObjectId>
    {
        /// <summary>
        /// Get sayings list by paging.
        /// </summary>
        /// <param name="skipCount"></param>
        /// <param name="maxResultCount"></param>
        /// <returns></returns>
        Task<Tuple<int, List<Saying>>> GetPagedListAsync(int skipCount, int maxResultCount);

        /// <summary>
        /// Get a saying.
        /// </summary>
        /// <returns></returns>
        Task<Saying> GetRandomAsync();
    }
}