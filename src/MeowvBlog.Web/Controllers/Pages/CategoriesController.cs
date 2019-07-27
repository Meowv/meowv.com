using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace MeowvBlog.Web.Controllers.Pages
{
    [AllowAnonymous]
    [ApiExplorerSettings(IgnoreApi = true)]
    public class CategoriesController : Controller
    {
        [Route("/categories")]
        public IActionResult Index() => View();

        [Route("/category/{name}")]
        public IActionResult Category() => View();
    }
}