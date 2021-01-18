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
            var configuration = context.Services.GetConfiguration();

            var swagger = new SwaggerOptions();
            var storage = new StorageOptions();
            var cors = new CorsOptions();
            var jwt = new JwtOptions();
            var worker = new WorkerOptions();
            var signature = new SignatureOptions();
            var authorize = new AuthorizeOptions();

            PreConfigure<SwaggerOptions>(options =>
            {
                var swaggerOption = configuration.GetSection("swagger");
                Configure<SwaggerOptions>(swaggerOption);

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
                Configure<StorageOptions>(storageOption);

                options.Mongodb = storageOption.GetValue<string>(nameof(options.Mongodb));
                options.RedisIsEnabled = storageOption.GetValue<bool>(nameof(options.RedisIsEnabled));
                options.Redis = storageOption.GetValue<string>(nameof(options.Redis));

                storage = options;
            });
            PreConfigure<CorsOptions>(options =>
            {
                var corsOption = configuration.GetSection("cors");
                Configure<CorsOptions>(corsOption);

                options.PolicyName = corsOption.GetValue<string>(nameof(options.PolicyName));
                options.Origins = corsOption.GetValue<string>(nameof(options.Origins));

                cors = options;
            });
            PreConfigure<JwtOptions>(options =>
            {
                var jwtOption = configuration.GetSection("jwt");
                Configure<JwtOptions>(jwtOption);

                options.Issuer = jwtOption.GetValue<string>(nameof(options.Issuer));
                options.Audience = jwtOption.GetValue<string>(nameof(options.Audience));
                options.SigningKey = jwtOption.GetValue<string>(nameof(options.SigningKey));

                jwt = options;
            });
            PreConfigure<WorkerOptions>(options =>
            {
                var workerOption = configuration.GetSection("worker");
                Configure<WorkerOptions>(workerOption);

                options.IsEnabled = workerOption.GetValue<bool>(nameof(options.IsEnabled));
                options.Cron = workerOption.GetValue<string>(nameof(options.Cron));

                worker = options;
            });

            PreConfigure<SignatureOptions>(options =>
            {
                var signatureOption = configuration.GetSection("signature");
                Configure<SignatureOptions>(signatureOption);

                options.Path = signatureOption.GetValue<string>(nameof(options.Path));

                foreach (var item in signatureOption.GetSection(nameof(options.Urls)).GetChildren())
                {
                    options.Urls.Add(item.GetValue<string>("url"), item.GetValue<string>("param"));
                }

                signature = options;
            });

            PreConfigure<AuthorizeOptions>(options =>
            {
                var authorizeOption = configuration.GetSection("authorize");
                Configure<AuthorizeOptions>(authorizeOption);

                options.Account = new AccountOptions
                {
                    Username = authorizeOption.GetSection(nameof(options.Account)).GetValue<string>(nameof(options.Account.Username)),
                    Password = authorizeOption.GetSection(nameof(options.Account)).GetValue<string>(nameof(options.Account.Password)),
                };
                options.Github = new GithubOptions
                {
                };
                options.Gitee = new GiteeOptions
                {
                };
                options.Microsoft = new MicrosoftOptions
                {
                };
                options.QQ = new QQOptions
                {
                };
                options.Weibo = new WeiboOptions
                {
                };
                options.Baidu = new BaiduOptions
                {
                };
                options.Dingtalk = new DingtalkOptions
                {
                };
                options.Alipay = new AlipayOptions
                {
                };

                authorize = options;
            });
            PreConfigure<AppOptions>(options =>
            {
                options.Swagger = swagger;
                options.Storage = storage;
                options.Cors = cors;
                options.Jwt = jwt;
                options.Worker = worker;
                options.Signature = signature;
                options.Authorize = authorize;
            });
        }

        public override void ConfigureServices(ServiceConfigurationContext context)
        {
            context.Services.ExecutePreConfiguredActions<SwaggerOptions>();
            context.Services.ExecutePreConfiguredActions<StorageOptions>();
            context.Services.ExecutePreConfiguredActions<CorsOptions>();
            context.Services.ExecutePreConfiguredActions<JwtOptions>();
            context.Services.ExecutePreConfiguredActions<WorkerOptions>();
            context.Services.ExecutePreConfiguredActions<SignatureOptions>();
            context.Services.ExecutePreConfiguredActions<AuthorizeOptions>();
        }
    }
}