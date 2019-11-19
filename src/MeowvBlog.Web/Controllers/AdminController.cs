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

        /// <summary>
        /// 文章管理
        /// </summary>
        /// <returns></returns>
        [Route("/admin/posts")]
        [Route("/admin/posts/page/{page:int:min(1)}")]
        public IActionResult Posts() => View();

        /// <summary>
        /// 添加文章
        /// </summary>
        /// <returns></returns>
        [Route("/admin/add_post")]
        public IActionResult AddPost() => View();

        /// <summary>
        /// 编辑文章
        /// </summary>
        /// <returns></returns>
        [Route("/admin/edit_post/{id:int:min(1)}")]
        public IActionResult EditPost() => View();

        /// <summary>
        /// 分类管理
        /// </summary>
        /// <returns></returns>
        [Route("/admin/categories")]
        public IActionResult Categories() => View();

        /// <summary>
        /// 标签管理
        /// </summary>
        /// <returns></returns>
        [Route("/admin/tags")]
        public IActionResult Tags() => View();

        /// <summary>
        /// 标签列表页，用于添加和编辑文章时点选标签
        /// </summary>
        /// <returns></returns>
        [Route("/admin/tags/list")]
        public IActionResult TagsList() => View();

        /// <summary>
        /// 友情链接
        /// </summary>
        /// <returns></returns>
        [Route("/admin/friendlinks")]
        public IActionResult FriendLinks() => View();

        /// <summary>
        /// 图集管理
        /// </summary>
        /// <returns></returns>
        [Route("/admin/gallery")]
        public IActionResult Gallery() => View();

        /// <summary>
        /// Notification
        /// </summary>
        /// <returns></returns>
        [Route("/admin/notification")]
        public IActionResult Notification() => View();
    }
}