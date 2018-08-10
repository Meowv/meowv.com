using Meowv.Models.AppSetting;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using System;
using System.Threading.Tasks;

namespace Meowv.Areas.Cat
{
    [ApiController, Route("[controller]")]
    public class CatController : ControllerBase
    {
        private AppSettings _settings;
        private IHostingEnvironment _hostingEnvironment;

        public CatController(IHostingEnvironment hostingEnvironment, IOptions<AppSettings> option)
        {
            _settings = option.Value;
            _hostingEnvironment = hostingEnvironment;
        }

        /// <summary>
        /// 获取 随机一猫图
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        public async Task<IActionResult> GetCat()
        {
            try
            {
                var cat_count = _settings.CatCount;
                var cat_path = _settings.CatPath;

                var random_num = new Random();
                var num = random_num.Next(1, cat_count + 1);

                var path = cat_path + num + ".jpg";
                var bytes = await System.IO.File.ReadAllBytesAsync(path);

                return File(bytes, "image/jpeg");
            }
            catch
            {
                return NotFound();
            }
        }
    }
}