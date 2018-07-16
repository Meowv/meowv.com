using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json.Linq;
using System.Net.Http;
using System.Threading.Tasks;

namespace Meowv.Areas.Bing
{
    [ApiController, Route("[Controller]")]
    public class BingController : ControllerBase
    {
        /// <summary>
        /// 获取 Bing每日壁纸
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        public async Task<IActionResult> GetBing()
        {
            try
            {
                var domain = "https://bing.com";
                var url = $"{domain}/HPImageArchive.aspx?format=js&idx=$daysAgo&n=1";

                using (var http = new HttpClient())
                {
                    var jsonContent = await http.GetStringAsync(url);

                    var obj = JObject.Parse(jsonContent);

                    var bingPicUrl = domain + obj["images"][0]["url"].ToString();

                    var bytes = await http.GetByteArrayAsync(bingPicUrl);

                    return File(bytes, "image/jpeg");
                }
            }
            catch
            {
                return NotFound();
            }
        }
    }
}