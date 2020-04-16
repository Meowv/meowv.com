using System;
using System.Collections.Generic;
using System.Text;
using MeowvBlog.Localization;
using Volo.Abp.Application.Services;

namespace MeowvBlog
{
    /* Inherit your application services from this class.
     */
    public abstract class MeowvBlogAppService : ApplicationService
    {
        protected MeowvBlogAppService()
        {
            LocalizationResource = typeof(MeowvBlogResource);
        }
    }
}
