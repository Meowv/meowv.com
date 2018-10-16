using Meowv.Models.AppSetting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using System;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading.Tasks;

namespace Meowv.Controllers
{
    [ApiExplorerSettings(IgnoreApi = true)]
    public class HomeController : Controller
    {
        private AppSettings _settings;

        public HomeController(IOptions<AppSettings> option)
        {
            _settings = option.Value;
        }

        [Route(""), Route("index.html")]
        public async Task<IActionResult> Index()
        {
            var url = _settings.Domain + "/api/token";

            using (var http = new HttpClient())
            {
                using (var content = new StringContent("{\"userName\": \"" + _settings.UserName + "\", \"password\": \"" + _settings.Password + "\"}", Encoding.UTF8))
                {
                    content.Headers.ContentType = new MediaTypeHeaderValue("application/json");
                    using (var responseMsg = await http.PostAsync(new Uri(url), content))
                    {
                        var result = await responseMsg.Content.ReadAsStringAsync();

                        result = result.Replace("{\"token\":\"", "").Replace("\"}", "");

                        Response.Cookies.Append("token", result);
                    }
                }
            }

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