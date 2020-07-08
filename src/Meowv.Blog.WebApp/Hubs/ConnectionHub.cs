using Microsoft.AspNetCore.SignalR;
using System.Threading.Tasks;

namespace Meowv.Blog.WebApp.Hubs
{
    public class ConnectionHub : Hub
    {
        /// <summary>
        /// 浏览器 Notification
        /// </summary>
        /// <param name="title"></param>
        /// <param name="message"></param>
        /// <param name="data"></param>
        /// <returns></returns>
        public async Task Notification(string title, string message, string data)
        {
            await Clients.All.SendAsync("ReceiveNotification", title, message, data);
        }
    }
}