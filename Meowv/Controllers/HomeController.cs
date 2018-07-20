using Microsoft.AspNetCore.Mvc;

namespace Meowv.Controllers
{
    [ApiExplorerSettings(IgnoreApi = true)]
    public class HomeController : Controller
    {
        [Route(""), Route("index.html")]
        public IActionResult Index()
        {
            ViewBag.Title = "api.meowv.com";
            return View();
        }

        [Route("job.html")]
        public IActionResult Job()
        {
            ViewBag.Title = "找工作-api.meowv.com";
            return View();
        }

        [Route("blog.html")]
        public IActionResult Blog()
        {
            ViewBag.Title = "当然我在瞎扯-api.meowv.com";
            return View();
        }

        [Route("news.html")]
        public IActionResult News()
        {
            ViewBag.Title = "每日热点聚合-api.meowv.com";
            return View();
        }

        [Route("article.html")]
        public IActionResult Article()
        {
            ViewBag.Title = "每日一文-api.meowv.com";
            return View();
        }

        [Route("random-article.html")]
        public IActionResult RandomArticle()
        {
            ViewBag.Title = "随机一文-api.meowv.com";
            return View();
        }

        [Route("girl.html")]
        public IActionResult Girl()
        {
            ViewBag.Title = "随机妹子图-api.meowv.com";
            return View();
        }

        [Route("cat.html")]
        public IActionResult Cat()
        {
            ViewBag.Title = "随机一猫图-api.meowv.com";
            return View();
        }

        [Route("bing.html")]
        public IActionResult Bing()
        {
            ViewBag.Title = "Bing每日壁纸-api.meowv.com";
            return View();
        }
    }
}