using MongoDB.Bson;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Volo.Abp.Domain.Repositories;

namespace Meowv.Blog.Domain.Messages.Repositories
{
    public interface IMessageRepository : IRepository<Message, ObjectId>
    {
        /// <summary>
        /// Get the list of messages by paging.
        /// </summary>
        /// <param name="skipCount"></param>
        /// <param name="maxResultCount"></param>
        /// <returns></returns>
        Task<Tuple<int, List<Message>>> GetPagedListAsync(int skipCount, int maxResultCount);
    }
}