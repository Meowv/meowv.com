using Microsoft.AspNetCore.SignalR;
using System;
using System.Threading.Tasks;

namespace MeowvBlog.Web.Hubs
{
    public class ConnectionHub : Hub
    {
        public int OnlineCount = 0;

        public override async Task OnConnectedAsync()
        {
            OnlineCount++;
            await Clients.All.SendAsync("OnlineCount", OnlineCount);
        }

        public override async Task OnDisconnectedAsync(Exception exception)
        {
            OnlineCount--;
            await Clients.All.SendAsync("OnlineCount", OnlineCount);
        }

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