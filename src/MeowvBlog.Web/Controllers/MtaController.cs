using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace MeowvBlog.Web.Controllers
{
    public class MTAController : Controller
    {
        public IActionResult Index()
        {
            return View();
        }
    }
}