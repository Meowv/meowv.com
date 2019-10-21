using MeowvBlog.Core;
using MeowvBlog.Core.Configurations;
using MeowvBlog.Core.Dto;
using MeowvBlog.Core.Dto.Weixin;
using Microsoft.AspNetCore.Mvc;
using Senparc.Weixin.MP.Containers;
using Senparc.Weixin.MP.Helpers;
using System.Threading.Tasks;

namespace MeowvBlog.API.Controllers
{
    [ApiController]
    [Route("[controller]")]
    [ApiExplorerSettings(GroupName = GlobalConsts.GroupName_v3)]
    public class CommonController : ControllerBase
    {
        /// <summary>
        /// 微信分享验证
        /// </summary>
        /// <param name="url"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("weixin_sign")]
        public async Task<Response<WeixinSignatureDto>> GetWeixinSignatureAsync(string url)
        {
            var response = new Response<WeixinSignatureDto>();

            if (string.IsNullOrEmpty(url))
            {
                response.Msg = "未提供URL";
                return response;
            }

            var ticket = await JsApiTicketContainer.TryGetJsApiTicketAsync(AppSettings.Weixin.AppId, AppSettings.Weixin.AppSecret);
            if (string.IsNullOrEmpty(ticket))
            {
                response.Msg = "获取Ticket出错";
                return response;
            }
            var noncestr = JSSDKHelper.GetNoncestr();
            var timestamp = JSSDKHelper.GetTimestamp();
            var signature = JSSDKHelper.GetSignature(ticket, noncestr, timestamp, url);

            var result = new WeixinSignatureDto
            {
                Timestamp = timestamp,
                Noncestr = noncestr,
                Ticket = ticket,
                Signature = signature
            };

            response.Result = result;
            return response;
        }
    }
}