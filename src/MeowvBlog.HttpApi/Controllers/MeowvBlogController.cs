using MeowvBlog.Localization;
using Volo.Abp.AspNetCore.Mvc;

namespace MeowvBlog.Controllers
{
    /* Inherit your controllers from this class.
     */
    public abstract class MeowvBlogController : AbpController
    {
        protected MeowvBlogController()
        {
            LocalizationResource = typeof(MeowvBlogResource);
        }
    }
}