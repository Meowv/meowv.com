using MongoDB.Bson;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Volo.Abp.Domain.Repositories;

namespace Meowv.Blog.Domain.Blog.Repositories
{
    public interface IPostRepository : IRepository<Post, ObjectId>
    {
        /// <summary>
        /// Gets post list by paging.
        /// </summary>
        /// <param name="skipCount"></param>
        /// <param name="maxResultCount"></param>
        /// <returns></returns>
        Task<Tuple<int, List<Post>>> GetPagedListAsync(int skipCount, int maxResultCount);
    }
}