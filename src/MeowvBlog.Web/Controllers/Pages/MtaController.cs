using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace MeowvBlog.Web.Controllers.Pages
{
    [AllowAnonymous]
    [ApiExplorerSettings(IgnoreApi = true)]
    public class MTAController : Controller
    {
        public IActionResult Index()
        {
            return View();
        }
    }
}