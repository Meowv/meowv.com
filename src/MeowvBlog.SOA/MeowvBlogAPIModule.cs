using MeowvBlog.Core;
using MeowvBlog.EntityFramework;
using MeowvBlog.Services;
using MeowvBlog.Services.Dto;
using System.Reflection;
using UPrime.Modules;

namespace MeowvBlog.SOA
{
    [DependsOn(
        typeof(MeowvBlogCoreModule),
        typeof(MeowvBlogServicesModule),
        typeof(MeowvBlogServicsDtoModule),
        typeof(MeowvBlogEntityFrameworkModule))]
    public class MeowvBlogSOAModule : UPrimeModule
    {
        public override void Initialize()
        {
            IocManager.RegisterAssembly(Assembly.GetExecutingAssembly());
        }
    }
}