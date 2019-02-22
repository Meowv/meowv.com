using Microsoft.AspNetCore.Mvc;

namespace Meowv.Web.Controllers
{
    [ApiExplorerSettings(IgnoreApi = true)]
    public class BlogController : Controller
    {
        [Route("/")]
        public IActionResult Index()
        {
            return View();
        }

        [Route("{url}.html")]
        public IActionResult Detail(string url)
        {
            return View();
        }

        [Route("categories/{categoryName}")]
        public IActionResult Categories(string categoryName)
        {
            return View();
        }

        [Route("tags/{tagName}")]
        public IActionResult Tags(string tagName)
        {
            return View();
        }
    }
}