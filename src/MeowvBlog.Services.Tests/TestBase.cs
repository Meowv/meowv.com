using Castle.Facilities.Logging;
using MeowvBlog.Services.Articles;
using MeowvBlog.Services.Categories;
using MeowvBlog.Services.Tags;
using UPrime;
using UPrime.Castle.Log4Net;

namespace MeowvBlog.Services.Tests
{
    public abstract class TestBase
    {
        protected  IArticleService _articleService;
        protected  ICategoryService _categoryService;
        protected  ITagService _tagService;

        public TestBase()
        {
            UPrimeStarter.Create<MeowvBlogTestsModule>(options =>
            {
                options.IocManager.IocContainer.AddFacility<LoggingFacility>(f => f.UseUpLog4Net().WithConfig("log4net.config"));
            }).Initialize();

            _articleService = UPrimeEngine.Instance.Resolve<IArticleService>();
            _categoryService = UPrimeEngine.Instance.Resolve<ICategoryService>();
            _tagService = UPrimeEngine.Instance.Resolve<ITagService>();
        }
    }
}