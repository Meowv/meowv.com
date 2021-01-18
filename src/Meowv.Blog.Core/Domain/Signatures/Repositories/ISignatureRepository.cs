using MongoDB.Bson;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Volo.Abp.Domain.Repositories;

namespace Meowv.Blog.Domain.Signatures.Repositories
{
    public interface ISignatureRepository : IRepository<Signature, ObjectId>
    {
        /// <summary>
        /// Get the list of signatures by paging.
        /// </summary>
        /// <param name="skipCount"></param>
        /// <param name="maxResultCount"></param>
        /// <returns></returns>
        Task<Tuple<int, List<Signature>>> GetPagedListAsync(int skipCount, int maxResultCount);
    }
}