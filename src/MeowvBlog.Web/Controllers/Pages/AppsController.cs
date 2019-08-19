using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace MeowvBlog.Web.Controllers.Pages
{
    [AllowAnonymous]
    [ApiExplorerSettings(IgnoreApi = true)]
    public class AppsController : Controller
    {
        /// <summary>
        /// Apps
        /// </summary>
        /// <returns></returns>
        [Route("/apps")]
        public IActionResult Index() => View();

        /// <summary>
        /// 吐个槽
        /// </summary>
        /// <returns></returns>
        [Route("/tucao")]
        public IActionResult TuCao() => View();

        /// <summary>
        /// Signature
        /// </summary>
        /// <returns></returns>
        [Route("/sign")]
        public IActionResult Signature() => View();

        /// <summary>
        /// NiceArticles
        /// </summary>
        /// <returns></returns>
        [Route("/articles")]
        [Route("/articles/page/{page:int:min(1)}")]
        public IActionResult NiceArticles() => View();

        /// <summary>
        /// 每日热点
        /// </summary>
        /// <returns></returns>
        [Route("/hot")]
        public IActionResult Hot() => View();

        /// <summary>
        /// 随机猫咪图
        /// </summary>
        /// <returns></returns>
        [Route("/cat")]
        public IActionResult Cat() => View();

        /// <summary>
        /// Bing每日壁纸
        /// </summary>
        /// <returns></returns>
        [Route("/bing")]
        public IActionResult Bing() => View();

        /// <summary>
        /// VIP视频解析
        /// </summary>
        /// <returns></returns>
        [Route("/v")]
        public IActionResult V() => View();

        /// <summary>
        /// Mta
        /// </summary>
        /// <returns></returns>
        [Route("/analysis")]
        public IActionResult Mta() => View();

        /// <summary>
        /// Commits
        /// </summary>
        /// <returns></returns>
        [Route("/commits")]
        public IActionResult Commits() => View();

        /// <summary>
        /// 友链
        /// </summary>
        /// <returns></returns>
        [Route("/friendlinks")]
        public IActionResult FriendLinks() => View();
    }
}