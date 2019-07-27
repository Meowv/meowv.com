using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace MeowvBlog.Web.Controllers.Admin
{
    [Authorize]
    [ApiExplorerSettings(IgnoreApi = true)]
    public class ManageController : Controller
    {
        [Route("/admin")]
        public IActionResult Index() => View();

        [Route("/admin/posts")]
        [Route("/admin/posts/page/{p:int}")]
        public IActionResult Posts() => View();

        [Route("/admin/categories")]
        public IActionResult Categories() => View();

        [Route("/admin/tags")]
        public IActionResult Tags() => View();
    }
}