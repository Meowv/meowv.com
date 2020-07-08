using Microsoft.AspNetCore.Mvc;

namespace Meowv.Blog.WebApp.Controllers
{
    public class PostsController : Controller
    {
        /// <summary>
        /// 文章列表页
        /// </summary>
        /// <returns></returns>
        [Route("/posts")]
        [Route("/posts/page/{page:int:min(1)}")]
        public IActionResult Index() => View();

        /// <summary>
        /// 文章详情页
        /// </summary>
        /// <returns></returns>
        [Route("/post/{year:int:min(2014):max(2024):length(4)}/{month:int:range(1,12)}/{day:int:range(1,31)}/{url}")]
        public IActionResult Detail() => View();
    }
}