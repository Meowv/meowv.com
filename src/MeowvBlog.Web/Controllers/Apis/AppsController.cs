using MeowvBlog.Core.Configuration;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Plus;
using System.Collections.Generic;

namespace MeowvBlog.Web.Controllers.Apis
{
    [Route("api/[controller]")]
    [AllowAnonymous]
    [ApiController]
    public class AppsController : ControllerBase
    {
        /// <summary>
        /// VIP视频解析URL接口
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("vip_urls")]
        public List<NameValue<string>> VipUrls()
        {
            var result = new List<NameValue<string>>();

            var names = "①/②/③/④/⑤/⑥/⑦/⑧/⑨/⑩";

            var urls = AppSettings.VipUrls;

            for (int i = 0; i < urls.Count; i++)
            {
                result.Add(new NameValue<string>
                {
                    Name = $"{names.Split("/")[i]}全网通用VIP视频解析接口",
                    Value = urls[i]
                });
            }

            return result;
        }
    }
}