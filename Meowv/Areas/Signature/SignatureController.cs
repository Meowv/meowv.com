using Meowv.Models.AppSetting;
using Meowv.Models.JsonResult;
using Meowv.Models.Signature;
using Meowv.Processor.Signature;
using Meowv.Utilities;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using System;
using System.ComponentModel;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Reflection;
using System.Threading.Tasks;

namespace Meowv.Areas.Signature
{
    [ApiController, Route("[Controller]")]
    public class SignatureController : ControllerBase
    {
        private AppSettings _settings;
        private IHostingEnvironment _hostingEnvironment;

        public SignatureController(IHostingEnvironment hostingEnvironment, IOptions<AppSettings> option)
        {
            _settings = option.Value;
            _hostingEnvironment = hostingEnvironment;
        }

        /// <summary>
        /// 艺术签
        /// </summary>
        /// <param name="name">姓名</param>
        /// <returns></returns>
        [HttpGet, Route("art")]
        public async Task<JsonResult<SignatureEntity>> GetArtSignature(string name)
        {
            return await GetSignature(name, SignatureEnum._art);
        }

        /// <summary>
        /// 商务签
        /// </summary>
        /// <param name="name">姓名</param>
        /// <returns></returns>
        [HttpGet, Route("biz")]
        public async Task<JsonResult<SignatureEntity>> GetBizSignature(string name)
        {
            return await GetSignature(name, SignatureEnum._biz);
        }

        /// <summary>
        /// 获取签名
        /// </summary>
        /// <param name="name">姓名</param>
        /// <param name="signature">签名类型</param>
        /// <returns></returns>
        [NonAction]
        public async Task<JsonResult<SignatureEntity>> GetSignature(string name, SignatureEnum signature)
        {
            try
            {
                var url = "http://www.jiqie.com";

                var fromUrlContent = new StringContent($"id={name}&idi=jiqie&id1=800&id2={(int)signature}&id3=#000000&id4=#000000&id5=#000000&id6=#000000");
                fromUrlContent.Headers.ContentType = new MediaTypeHeaderValue("application/x-www-form-urlencoded");

                using (var http = new HttpClient())
                {
                    var responseMsg = await http.PostAsync(new Uri(url + "/a/re22.php"), fromUrlContent);
                    var htmlContent = await responseMsg.Content.ReadAsStringAsync();

                    var signUrl = htmlContent.Replace("<img src=\"", url + "/").Replace("\">", "");

                    var path = $"{_hostingEnvironment.WebRootPath}/signature/{name}{signature}.jpg";

                    DownLoadFileHelper.DownLoadFile(signUrl, path);

                    var entity = new SignatureEntity
                    {
                        Name = name,
                        Type = signature
                            .GetType()
                            .GetMember(signature.ToString())
                            .FirstOrDefault()
                            .GetCustomAttribute<DescriptionAttribute>()
                            .Description,
                        Url = $"{_settings.Domain}/signature/{name}{signature}.gif"
                    };

                    return new JsonResult<SignatureEntity> { Result = entity };
                }
            }
            catch (Exception e)
            {
                return new JsonResult<SignatureEntity> { Reason = e.Message };
            }
        }
    }
}