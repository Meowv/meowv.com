using Microsoft.AspNetCore.Mvc;

namespace MeowvBlog.Web.Controllers.Pages
{
    [ApiExplorerSettings(IgnoreApi = true)]
    public class CategoriesController : Controller
    {
        [Route("/categories")]
        public IActionResult Index() => View();

        [Route("/category/{name}")]
        public IActionResult Category() => View();
    }
}