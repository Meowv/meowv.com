using Volo.Abp.AspNetCore.Mvc.UI.Theme.Shared.Components;
using Volo.Abp.DependencyInjection;

namespace MeowvBlog.Web
{
    [Dependency(ReplaceServices = true)]
    public class MeowvBlogBrandingProvider : DefaultBrandingProvider
    {
        public override string AppName => "MeowvBlog";
    }
}
