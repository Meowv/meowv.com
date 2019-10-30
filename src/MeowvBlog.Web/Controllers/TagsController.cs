using Microsoft.AspNetCore.Mvc;

namespace MeowvBlog.Web.Controllers
{
    public class TagsController : Controller
    {
        /// <summary>
        /// 标签页
        /// </summary>
        /// <returns></returns>
        [Route("/tags")]
        public IActionResult Index() => View();

        /// <summary>
        /// 标签查询文章列表页
        /// </summary>
        /// <returns></returns>
        [Route("/tag/{name}")]
        public IActionResult Tag() => View();
    }
}