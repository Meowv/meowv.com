using Microsoft.AspNetCore.Mvc;

namespace Meowv.Blog.WebApp.Controllers
{
    public class HomeController : Controller
    {
        /// <summary>
        /// 首页
        /// </summary>
        /// <returns></returns>
        [Route("/")]
        [Route("/index.html")]
        public IActionResult Index() => View();
    }
}