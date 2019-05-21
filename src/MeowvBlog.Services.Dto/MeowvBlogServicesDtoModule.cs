using Plus.AutoMapper;
using Plus.Modules;
using System.Reflection;

namespace MeowvBlog.Services.Dto
{
    [DependsOn(typeof(PluseAutoMapperModule))]
    public class MeowvBlogServicesDtoModule : PlusModule
    {
        public override void Initialize()
        {
            IocManager.RegisterAssembly(Assembly.GetExecutingAssembly());
        }
    }
}