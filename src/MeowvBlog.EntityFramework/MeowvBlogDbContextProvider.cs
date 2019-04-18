using UPrime.Dependency;
using UPrime.Domain.Uow;
using UPrime.EntityFramework;
using UPrime.EntityFramework.Uow;

namespace MeowvBlog.EntityFramework
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