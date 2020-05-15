using Meowv.Blog.Localization;
using Volo.Abp.AspNetCore.Mvc.UI.RazorPages;

namespace Meowv.Blog.Web.Pages
{
    /* Inherit your PageModel classes from this class.
     */
    public abstract class BlogPageModel : AbpPageModel
    {
        protected BlogPageModel()
        {
            LocalizationResourceType = typeof(BlogResource);
        }
    }
}