using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace MeowvBlog.Web.Controllers.Pages
{
    [AllowAnonymous]
    [ApiExplorerSettings(IgnoreApi = true)]
    public class HomeController : Controller
    {
        /// <summary>
        /// 首页
        /// </summary>
        /// <returns></returns>
        [Route("/")]
        [Route("/index.html")]
        public IActionResult Index() => View();

        /// <summary>
        /// 鉴权页
        /// </summary>
        /// <returns></returns>
        [Route("/account/auth")]
        public IActionResult Auth() => View();
    }
}