using Microsoft.AspNetCore.Mvc;

namespace MeowvBlog.Web.Controllers
{
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
        /// 每日热点
        /// </summary>
        /// <returns></returns>
        [Route("/hot")]
        public IActionResult Hot() => View();

        /// <summary>
        /// 随机妹子图
        /// </summary>
        /// <returns></returns>
        [Route("/girl")]
        public IActionResult Girl() => View();

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
        /// Mta
        /// </summary>
        /// <returns></returns>
        [Route("/analysis")]
        public IActionResult Mta() => View();

        /// <summary>
        /// 友链
        /// </summary>
        /// <returns></returns>
        [Route("/friendlinks")]
        public IActionResult FriendLinks() => View();

        /// <summary>
        /// 图集相册
        /// </summary>
        /// <returns></returns>
        [Route("/gallery")]
        public IActionResult Gallery() => View();

        /// <summary>
        /// 毒鸡汤
        /// </summary>
        /// <returns></returns>
        [Route("/soul")]
        public IActionResult Soul() => View();

        /// <summary>
        /// 2048
        /// </summary>
        /// <returns></returns>
        [Route("/2048")]
        public IActionResult Game2048() => View();

        /// <summary>
        /// 壁纸
        /// </summary>
        /// <returns></returns>
        [Route("/wallpaper")]
        public IActionResult Wallpaper() => View();
    }
}