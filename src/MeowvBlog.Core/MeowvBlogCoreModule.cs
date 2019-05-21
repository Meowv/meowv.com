using Plus;
using Plus.Modules;
using System.Reflection;

namespace MeowvBlog.Core
{
    [DependsOn(typeof(PlusLeadershipModule))]
    public class MeowvBlogCoreModule : PlusModule
    {
        public override void Initialize()
        {
            IocManager.RegisterAssembly(Assembly.GetExecutingAssembly());
        }
    }
}