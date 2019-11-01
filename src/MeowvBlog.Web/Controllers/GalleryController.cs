using Microsoft.AspNetCore.Mvc;

namespace MeowvBlog.Web.Controllers
{
    [Route("[controller]")]
    public class GalleryController : Controller
    {
        public IActionResult Index() => View();
    }
}