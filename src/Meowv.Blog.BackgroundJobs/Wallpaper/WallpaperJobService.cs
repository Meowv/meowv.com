using Meowv.Blog.BackgroundJobs.Interface;
using System;
using System.Threading.Tasks;

namespace Meowv.Blog.BackgroundJobs.Wallpaper
{
    public class WallpaperJobService : IBackgroundJob
    {
        public async Task ExecuteAsync()
        {
            Console.WriteLine("抓取壁纸");

            await Task.CompletedTask;
        }
    }
}