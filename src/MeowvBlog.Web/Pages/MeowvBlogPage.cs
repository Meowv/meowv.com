using Microsoft.AspNetCore.Mvc.Localization;
using Microsoft.AspNetCore.Mvc.Razor.Internal;
using MeowvBlog.Localization;
using Volo.Abp.AspNetCore.Mvc.UI.RazorPages;

namespace MeowvBlog.Web.Pages
{
    /* Inherit your UI Pages from this class. To do that, add this line to your Pages (.cshtml files under the Page folder):
     * @inherits MeowvBlog.Web.Pages.MeowvBlogPage
     */
    public abstract class MeowvBlogPage : AbpPage
    {
        [RazorInject]
        public IHtmlLocalizer<MeowvBlogResource> L { get; set; }
    }
}
