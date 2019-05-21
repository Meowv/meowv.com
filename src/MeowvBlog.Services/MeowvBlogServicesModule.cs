using MeowvBlog.Services.Dto;
using Plus.AutoMapper;
using Plus.Modules;
using System.Reflection;

namespace MeowvBlog.Services
{
    [DependsOn(
        typeof(PluseAutoMapperModule),
        typeof(MeowvBlogServicesDtoModule)
    )]
    public class MeowvBlogServicesModule : PlusModule
    {
        public override void Initialize()
        {
            IocManager.RegisterAssembly(Assembly.GetExecutingAssembly());
        }
    }
}