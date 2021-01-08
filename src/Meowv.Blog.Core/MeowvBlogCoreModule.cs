using Meowv.Blog.Options;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Volo.Abp.Domain;
using Volo.Abp.Modularity;

namespace Meowv.Blog
{
    [DependsOn(typeof(AbpDddDomainModule))]
    public class MeowvBlogCoreModule : AbpModule
    {
        public override void PreConfigureServices(ServiceConfigurationContext context)
        {
            var configuration = context.Services.BuildServiceProvider().GetService<IConfiguration>();

            var swagger = new SwaggerOptions();
            var storage = new StorageOptions();

            PreConfigure<SwaggerOptions>(options =>
            {
                var swaggerOption = configuration.GetSection("swagger");

                options.Version = swaggerOption.GetValue<string>(nameof(options.Version));
                options.Name = swaggerOption.GetValue<string>(nameof(options.Name));
                options.Title = swaggerOption.GetValue<string>(nameof(options.Title));
                options.Description = swaggerOption.GetValue<string>(nameof(options.Description));
                options.RoutePrefix = swaggerOption.GetValue<string>(nameof(options.RoutePrefix));
                options.DocumentTitle = swaggerOption.GetValue<string>(nameof(options.DocumentTitle));

                swagger = options;
            });
            PreConfigure<StorageOptions>(options =>
            {
                var storageOption = configuration.GetSection("storage");

                options.Mongodb = storageOption.GetValue<string>(nameof(options.Mongodb));

                storage = options;
            });
            PreConfigure<AppOptions>(options =>
            {
                options.Swagger = swagger;
                options.Storage = storage;
            });
        }
    }
}