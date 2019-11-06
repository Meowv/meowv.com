using Microsoft.AspNetCore.Mvc;

namespace MeowvBlog.Web.Controllers
{
    public class AdminController : Controller
    {
        /// <summary>
        /// 鉴权
        /// </summary>
        /// <returns></returns>
        [Route("/account/auth")]
        public IActionResult Auth() => View();

        /// <summary>
        /// 后台管理
        /// </summary>
        /// <returns></returns>
        [Route("/admin")]
        public IActionResult Index() => View();
    }
}