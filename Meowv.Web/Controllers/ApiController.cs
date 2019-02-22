using Microsoft.AspNetCore.Mvc;

namespace Meowv.Web.Controllers
{
    [Route("api")]
    [ApiExplorerSettings(IgnoreApi = true)]
    public class ApiController : Controller
    {
        public IActionResult Index()
        {
            return View();
        }
    }
}