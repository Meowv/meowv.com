using Meowv.Blog.Options;
using Microsoft.Extensions.DependencyInjection;
using System.Text;
using Volo.Abp.BackgroundWorkers.Quartz;
using Volo.Abp.Modularity;

namespace Meowv.Blog
{
    [DependsOn(
        typeof(AbpBackgroundWorkersQuartzModule),
        typeof(MeowvBlogCoreModule)
    )]
    public class MeowvBlogBackgroundWorkersModule : AbpModule
    {
        public override void ConfigureServices(ServiceConfigurationContext context)
        {
            var option = context.Services.ExecutePreConfiguredActions<WorkerOptions>();

            Configure<AbpBackgroundWorkerQuartzOptions>(options =>
            {
                options.IsAutoRegisterEnabled = option.IsEnabled;
            });

            context.Services.AddHttpClient();

            Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
        }
    }
}