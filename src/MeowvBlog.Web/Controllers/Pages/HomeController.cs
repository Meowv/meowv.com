using Microsoft.AspNetCore.Mvc;

namespace MeowvBlog.Web.Controllers.Pages
{
    [ApiExplorerSettings(IgnoreApi = true)]
    public class HomeController : Controller
    {
        [Route("/")]
        [Route("/index.html")]
        public IActionResult Index() => View();
    }
}