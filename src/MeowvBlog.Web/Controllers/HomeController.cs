using Microsoft.AspNetCore.Mvc;

namespace MeowvBlog.Web.Controllers
{
    public class HomeController : Controller
    {
        [Route("/")]
        [Route("/index.html")]
        public IActionResult Index() => View();
    }
}