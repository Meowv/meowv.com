using Plus;
using Plus.Domain.Uow;
using Plus.Services;

namespace MeowvBlog.Services
{
    public abstract class ServiceBase : ApplicationServiceBase
    {
        public IUnitOfWorkManager UnitOfWorkManager;

        public IGuidGenerator GuidGenerator;

        protected ServiceBase()
        {
            UnitOfWorkManager = PlusEngine.Instance.Resolve<IUnitOfWorkManager>();

            GuidGenerator = PlusEngine.Instance.Resolve<IGuidGenerator>();
        }
    }
}