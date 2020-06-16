using Meowv.Blog.Domain.Signature.Repositories;
using System;
using Volo.Abp.Domain.Repositories.EntityFrameworkCore;
using Volo.Abp.EntityFrameworkCore;

namespace Meowv.Blog.EntityFrameworkCore.Repositories.Signature
{
    /// <summary>
    /// SignatureRepository
    /// </summary>
    public class SignatureRepository : EfCoreRepository<MeowvBlogDbContext, Domain.Signature.Signature, Guid>, ISignatureRepository
    {
        public SignatureRepository(IDbContextProvider<MeowvBlogDbContext> dbContextProvider) : base(dbContextProvider)
        {
        }
    }
}