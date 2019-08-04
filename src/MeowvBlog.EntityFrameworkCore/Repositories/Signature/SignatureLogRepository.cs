using MeowvBlog.Core.Domain.Signature;
using MeowvBlog.Core.Domain.Signature.Repositories;
using Plus.EntityFramework;

namespace MeowvBlog.EntityFrameworkCore.Repositories.Signature
{
    public class SignatureLogRepository : MeowvBlogRepositoryBase<SignatureLog>, ISignatureLogRepository
    {
        public SignatureLogRepository(IDbContextProvider<MeowvBlogDbContext> dbContextProvider) : base(dbContextProvider)
        {
        }
    }
}