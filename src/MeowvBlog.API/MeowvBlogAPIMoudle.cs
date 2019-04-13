using MeowvBlog.Core;
using MeowvBlog.EntityFramework;
using MeowvBlog.Services;
using MeowvBlog.Services.Dto;
using System.Reflection;
using UPrime.Modules;

namespace MeowvBlog.API
{
    [DependsOn(
        typeof(MeowvBlogCoreMoudle),
        typeof(MeowvBlogServicesMoudle),
        typeof(MeowvBlogServicsDtoMoudle),
        typeof(MeowvBlogEntityFrameworkMoudle))]
    public class MeowvBlogAPIMoudle : UPrimeModule
    {
        public override void Initialize()
        {
            IocManager.RegisterAssembly(Assembly.GetExecutingAssembly());
        }
    }
}