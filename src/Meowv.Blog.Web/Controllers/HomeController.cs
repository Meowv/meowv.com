using Microsoft.AspNetCore.Mvc;

namespace Meowv.Blog.Web.Controllers
{
    public class HomeController : Controller
    {
        public IActionResult Index()
        {
            return View();
        }
    }
}