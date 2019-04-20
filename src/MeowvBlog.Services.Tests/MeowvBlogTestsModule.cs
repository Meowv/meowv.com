using MeowvBlog.Core;
using MeowvBlog.EntityFramework;
using MeowvBlog.Services.Dto;
using System.Reflection;
using UPrime.Modules;

namespace MeowvBlog.Services.Tests
{
    [DependsOn(
        typeof(MeowvBlogCoreModule),
        typeof(MeowvBlogEntityFrameworkModule),
        typeof(MeowvBlogServicesModule),
        typeof(MeowvBlogServicsDtoModule))]
    public class MeowvBlogTestsModule : UPrimeModule
    {
        public override void Initialize()
        {
            IocManager.RegisterAssembly(Assembly.GetExecutingAssembly());
        }
    }
}