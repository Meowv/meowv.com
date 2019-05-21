using Plus.Dependency;
using Plus.Domain.Uow;
using Plus.EntityFramework;
using Plus.EntityFramework.Uow;

namespace MeowvBlog.EntityFrameworkCore
{
    public class MeowvBlogDbContextProvider : IDbContextProvider<MeowvBlogDbContext>, ITransientDependency
    {
        private readonly ICurrentUnitOfWorkProvider _currentUnitOfWorkProvider;

        public MeowvBlogDbContextProvider(ICurrentUnitOfWorkProvider currentUnitOfWorkProvider)
        {
            _currentUnitOfWorkProvider = currentUnitOfWorkProvider;
        }

        public MeowvBlogDbContext GetDbContext()
        {
            return ((EfCoreUnitOfWork)_currentUnitOfWorkProvider.Current).GetDbContext<MeowvBlogDbContext>();
        }
    }
}