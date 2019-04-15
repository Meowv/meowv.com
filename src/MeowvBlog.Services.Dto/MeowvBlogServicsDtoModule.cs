using System.Reflection;
using UPrime.AutoMapper;
using UPrime.Modules;

namespace MeowvBlog.Services.Dto
{
    [DependsOn(typeof(UPrimeAutoMapperModule))]
    public class MeowvBlogServicsDtoModule : UPrimeModule
    {
        public override void Initialize()
        {
            IocManager.RegisterAssembly(Assembly.GetExecutingAssembly());
        }
    }
}