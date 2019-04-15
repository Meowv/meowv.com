using MeowvBlog.Services.Dto;
using System.Reflection;
using UPrime.Modules;

namespace MeowvBlog.Services
{
    [DependsOn(typeof(MeowvBlogServicsDtoModule))]
    public class MeowvBlogServicesModule : UPrimeModule
    {
        public override void Initialize()
        {
            IocManager.RegisterAssembly(Assembly.GetExecutingAssembly());
        }
    }
}