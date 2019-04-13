using MeowvBlog.Services.Dto;
using System.Reflection;
using UPrime.Modules;

namespace MeowvBlog.Services
{
    [DependsOn(typeof(MeowvBlogServicsDtoMoudle))]
    public class MeowvBlogServicesMoudle : UPrimeModule
    {
        public override void Initialize()
        {
            IocManager.RegisterAssembly(Assembly.GetExecutingAssembly());
        }
    }
}