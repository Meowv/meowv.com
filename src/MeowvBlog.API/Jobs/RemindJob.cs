using Microsoft.Extensions.Hosting;
using System;
using System.Threading;
using System.Threading.Tasks;

namespace MeowvBlog.API.Jobs
{
    public class RemindJob : BackgroundService
    {
        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                Console.WriteLine(DateTime.Now);

                await Task.Delay(1000, stoppingToken);
            }
        }
    }
}