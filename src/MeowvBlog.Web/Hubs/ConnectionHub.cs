using Microsoft.AspNetCore.SignalR;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace MeowvBlog.Web.Hubs
{
    public class ConnectionHub : Hub
    {
        public HashSet<string> ConnectedIds = new HashSet<string>();

        /// <summary>
        /// 当建立连接时调用
        /// </summary>
        /// <returns></returns>
        public override async Task OnConnectedAsync()
        {
            ConnectedIds.Add(Context.ConnectionId);

            await Clients.All.SendAsync("OnlineCount", ConnectedIds.Count);
        }

        /// <summary>
        /// 当连接终止时调用
        /// </summary>
        /// <param name="exception"></param>
        /// <returns></returns>
        public override async Task OnDisconnectedAsync(Exception exception)
        {
            ConnectedIds.Remove(Context.ConnectionId);

            await Clients.All.SendAsync("OnlineCount", ConnectedIds.Count);
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