using System.Reflection;
using UPrime.AutoMapper;
using UPrime.Modules;

namespace MeowvBlog.Services.Dto
{
    [DependsOn(typeof(UPrimeAutoMapperModule))]
    public class MeowvBlogServicsDtoMoudle : UPrimeModule
    {
        public override void Initialize()
        {
            IocManager.RegisterAssembly(Assembly.GetExecutingAssembly());
        }
    }
}