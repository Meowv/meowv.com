using System.Threading.Tasks;
using UPrime;
using UPrime.Domain.Uow;
using UPrime.Events.Bus;
using UPrime.Reflection;
using UPrime.Services;

namespace MeowvBlog.Services
{
    /// <summary>
    /// 服务基类，实现类必须继承此类
    /// </summary>
    public class ServiceBase : ApplicationServiceBase
    {
        public EventBus EventBus => EventBus.Default;

        public IUnitOfWorkManager UnitOfWorkManager;

        public ITypeFinder TypeFinder;

        public ServiceBase()
        {
            UnitOfWorkManager = UPrimeEngine.Instance.Resolve<IUnitOfWorkManager>();
            TypeFinder = UPrimeEngine.Instance.Resolve<ITypeFinder>();
        }

        public Task TaskReturnNull()
        {
            return Task.FromResult(0);
        }
    }
}