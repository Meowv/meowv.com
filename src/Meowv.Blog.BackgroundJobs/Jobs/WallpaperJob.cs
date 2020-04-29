using Meowv.Blog.Application.Wallpaper;
using Meowv.Blog.ToolKits.Base;
using Microsoft.Extensions.DependencyInjection;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Volo.Abp.DependencyInjection;

namespace Meowv.Blog.BackgroundJobs.Jobs
{
    public class WallpaperJob : ITransientDependency
    {
        private readonly IServiceProvider _serviceProvider;

        public WallpaperJob(IServiceProvider serviceProvider)
        {
            _serviceProvider = serviceProvider;
        }

        public async Task<ServiceResult<IEnumerable<EnumResponse>>> DoSomethingAsync()
        {
            using var scope = _serviceProvider.CreateScope();

            var services = scope.ServiceProvider.GetService<IWallpaperService>();

            return await services.GetWallpaperTypesAsync();
        }
    }
}