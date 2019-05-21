using MeowvBlog.Core;
using MeowvBlog.EntityFrameworkCore;
using MeowvBlog.Services;
using MeowvBlog.Services.Dto;
using Plus.Modules;
using System.Reflection;

namespace MeowvBlog.Web
{
    [DependsOn(
        typeof(MeowvBlogCoreModule),
        typeof(MeowvBlogServicesModule),
        typeof(MeowvBlogServicesDtoModule),
        typeof(MeowvBlogEntityFrameworkCoreModule)
    )]
    public class MeowvBlogWebModule : PlusModule
    {
        public override void Initialize()
        {
            IocManager.RegisterAssembly(Assembly.GetExecutingAssembly());
        }
    }
}