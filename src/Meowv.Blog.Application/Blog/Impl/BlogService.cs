using Volo.Abp.Application.Services;

namespace Meowv.Blog.Application.Blog.Impl
{
    public class BlogService : ApplicationService, IBlogService
    {
        /// <summary>
        /// ...
        /// </summary>
        /// <returns></returns>
        public string Get()
        {
            return "qix";
        }
    }
}