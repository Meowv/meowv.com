using MeowvBlog.Core.Configuration;
using Senparc.Weixin.MP.Containers;
using Senparc.Weixin.MP.Helpers;
using System.Threading.Tasks;

namespace MeowvBlog.Weixin
{
    public static class WeixinExtension
    {
        private static string AppId => AppSettings.Weixin.AppId;

        private static string AppSecret => AppSettings.Weixin.AppSecret;

        public static async Task<WeixinResponse> WeixinSignResponse(this string url)
        {
            var response = new WeixinResponse();

            var timestamp = JSSDKHelper.GetTimestamp();
            var noncestr = JSSDKHelper.GetNoncestr();

            var ticket = await JsApiTicketContainer.TryGetJsApiTicketAsync(AppId, AppSecret);
            if (ticket.IsNullOrEmpty())
                response.Message = "获取ticket出错了~~";

            var signature = JSSDKHelper.GetSignature(ticket, noncestr, timestamp, url);
            if (signature.IsNullOrEmpty())
                response.Message = "获取signature出错了~~";

            response.Timestamp = timestamp;
            response.Noncestr = noncestr;
            response.Ticket = ticket;
            response.Signature = signature;

            return response;
        }
    }
}