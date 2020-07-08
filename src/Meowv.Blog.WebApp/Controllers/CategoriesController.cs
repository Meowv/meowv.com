using Microsoft.AspNetCore.Mvc;

namespace Meowv.Blog.WebApp.Controllers
{
    public class CategoriesController : Controller
    {
        /// <summary>
        /// 分类页
        /// </summary>
        /// <returns></returns>
        [Route("/categories")]
        public IActionResult Index() => View();

        /// <summary>
        /// 分类查询文章列表页
        /// </summary>
        /// <returns></returns>
        [Route("/category/{name}")]
        public IActionResult Category() => View();
    }
}