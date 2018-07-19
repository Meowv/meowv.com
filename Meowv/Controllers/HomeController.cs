using Microsoft.AspNetCore.Mvc;

namespace Meowv.Controllers
{
    public class HomeController : Controller
    {
        public IActionResult Index()
        {
            ViewBag.Title = "api.meowv.com";
            return View();
        }
    }
}