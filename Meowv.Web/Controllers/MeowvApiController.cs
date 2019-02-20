using Microsoft.AspNetCore.Mvc;

namespace Meowv.Web.Controllers
{
    [ApiExplorerSettings(IgnoreApi = true)]
    public class MeowvApiController : Controller
    {
        [Route("api")]
        public IActionResult Index()
        {
            return View();
        }
    }
}