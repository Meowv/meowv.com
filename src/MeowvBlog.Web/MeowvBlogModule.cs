using Plus.Modules;
using System.Reflection;

namespace MeowvBlog.Web
{
    public class MeowvBlogModule : PlusModule
    {
        public override void Initialize()
        {
            IocManager.RegisterAssembly(Assembly.GetExecutingAssembly());
        }
    }
}