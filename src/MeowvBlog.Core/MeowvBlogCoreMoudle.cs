using System.Reflection;
using UPrime;
using UPrime.Modules;

namespace MeowvBlog.Core
{
    [DependsOn(typeof(UPrimeLeadershipModule))]
    public class MeowvBlogCoreMoudle : UPrimeModule
    {
        public override void Initialize()
        {
            IocManager.RegisterAssembly(Assembly.GetExecutingAssembly());
        }
    }
}