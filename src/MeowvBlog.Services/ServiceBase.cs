using Plus;
using Plus.Domain.Uow;
using Plus.Services;

namespace MeowvBlog.Services
{
    public abstract class ServiceBase : ApplicationServiceBase
    {
        public IUnitOfWorkManager UnitOfWorkManager;

        protected ServiceBase()
        {
            UnitOfWorkManager = PlusEngine.Instance.Resolve<IUnitOfWorkManager>();
        }
    }
}