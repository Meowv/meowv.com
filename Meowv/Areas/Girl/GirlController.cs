using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json.Linq;
using System.Net.Http;
using System.Threading.Tasks;

namespace Meowv.Areas.Girl
{
    [ApiController, Route("[Controller]")]
    public class GirlController : ControllerBase
    {
        /// <summary>
        /// 获取随机妹子图
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        public async Task<IActionResult> GetGirl()
        {
            try
            {
                var url = "https://gank.io/api/random/data/福利/1";

                using (var http = new HttpClient())
                {
                    var jsonContent = await http.GetStringAsync(url);

                    var obj = JObject.Parse(jsonContent);

                    var girlPicName = obj["results"][0]["url"].ToString();

                    var bytes = await http.GetByteArrayAsync(girlPicName);

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