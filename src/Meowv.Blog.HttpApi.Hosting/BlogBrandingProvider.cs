using Volo.Abp.AspNetCore.Mvc.UI.Theme.Shared.Components;
using Volo.Abp.DependencyInjection;

namespace Meowv.Blog.Web
{
    [Dependency(ReplaceServices = true)]
    public class BlogBrandingProvider : DefaultBrandingProvider
    {
        public override string AppName => "Blog";
    }
}
