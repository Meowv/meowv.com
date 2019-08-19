using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace MeowvBlog.Web.Controllers.Admin
{
    [Authorize]
    [ApiExplorerSettings(IgnoreApi = true)]
    public class ManageController : Controller
    {
        /// <summary>
        /// 后台管理首页
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
        /// 标签列表页，用于添加和编辑文章中
        /// </summary>
        /// <returns></returns>
        [Route("/admin/tags/list")]
        public IActionResult TagsList() => View();

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
        /// 添加 NiceArticle
        /// </summary>
        /// <returns></returns>
        [Route("/admin/add_article")]
        public IActionResult AddNiceArticle() => View();

        /// <summary>
        /// 友情链接
        /// </summary>
        /// <returns></returns>
        [Route("/admin/friendlinks")]
        public IActionResult FriendLinks() => View();
    }
}