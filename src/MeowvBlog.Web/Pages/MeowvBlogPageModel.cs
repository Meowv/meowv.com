using MeowvBlog.Localization;
using Volo.Abp.AspNetCore.Mvc.UI.RazorPages;

namespace MeowvBlog.Web.Pages
{
    /* Inherit your PageModel classes from this class.
     */
    public abstract class MeowvBlogPageModel : AbpPageModel
    {
        protected MeowvBlogPageModel()
        {
            LocalizationResourceType = typeof(MeowvBlogResource);
        }
    }
}