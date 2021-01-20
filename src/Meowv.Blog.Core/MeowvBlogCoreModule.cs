using Meowv.Blog.Options;
using Meowv.Blog.Options.Authorize;
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
            var tencentCloud = new TencentCloudOptions();
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
            PreConfigure<TencentCloudOptions>(options =>
            {
                var tencentCloudOption = configuration.GetSection("tencentCloud");
                Configure<TencentCloudOptions>(tencentCloudOption);

                options.SecretId = tencentCloudOption.GetValue<string>(nameof(options.SecretId));
                options.SecretKey = tencentCloudOption.GetValue<string>(nameof(options.SecretKey));

                tencentCloud = options;
            });
            PreConfigure<SignatureOptions>(options =>
            {
                var signatureOption = configuration.GetSection("signature");

                options.Path = signatureOption.GetValue<string>(nameof(options.Path));

                foreach (var item in signatureOption.GetSection(nameof(options.Urls)).GetChildren())
                {
                    options.Urls.Add(item.GetValue<string>("url"), item.GetValue<string>("param"));
                }

                signature = options;
                Configure<SignatureOptions>(item =>
                {
                    item.Path = signature.Path;
                    item.Urls = signature.Urls;
                });
            });
            PreConfigure<AuthorizeOptions>(options =>
            {
                var authorizeOption = configuration.GetSection("authorize");
                var githubOption = authorizeOption.GetSection("github");
                var giteeOption = authorizeOption.GetSection("gitee");
                var alipayOption = authorizeOption.GetSection("alipay");

                Configure<AuthorizeOptions>(authorizeOption);
                Configure<GithubOptions>(githubOption);
                Configure<GiteeOptions>(giteeOption);
                Configure<AlipayOptions>(alipayOption);

                options.Github = new GithubOptions
                {
                    ClientId = githubOption.GetValue<string>(nameof(options.Github.ClientId)),
                    ClientSecret = githubOption.GetValue<string>(nameof(options.Github.ClientSecret)),
                    RedirectUrl = githubOption.GetValue<string>(nameof(options.Github.RedirectUrl)),
                    Scope = githubOption.GetValue<string>(nameof(options.Github.Scope))
                };
                options.Gitee = new GiteeOptions
                {
                    ClientId = giteeOption.GetValue<string>(nameof(options.Gitee.ClientId)),
                    ClientSecret = giteeOption.GetValue<string>(nameof(options.Gitee.ClientSecret)),
                    RedirectUrl = giteeOption.GetValue<string>(nameof(options.Gitee.RedirectUrl)),
                    Scope = giteeOption.GetValue<string>(nameof(options.Gitee.Scope))
                };
                options.Alipay = new AlipayOptions
                {
                    AppId = alipayOption.GetValue<string>(nameof(options.Alipay.AppId)),
                    AppKey = alipayOption.GetValue<string>(nameof(options.Alipay.AppKey)),
                    RedirectUrl = alipayOption.GetValue<string>(nameof(options.Alipay.RedirectUrl)),
                    Scope = alipayOption.GetValue<string>(nameof(options.Alipay.Scope)),
                    PrivateKey = alipayOption.GetValue<string>(nameof(options.Alipay.PrivateKey)),
                    PublicKey = alipayOption.GetValue<string>(nameof(options.Alipay.PublicKey))
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
                options.TencentCloud = tencentCloud;
                options.Authorize = authorize;

                Configure<AppOptions>(item =>
                {
                    item.Swagger = swagger;
                    item.Storage = storage;
                    item.Cors = cors;
                    item.Jwt = jwt;
                    item.Worker = worker;
                    item.Signature = signature;
                    item.TencentCloud = tencentCloud;
                    item.Authorize = authorize;
                });
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
            context.Services.ExecutePreConfiguredActions<TencentCloudOptions>();
            context.Services.ExecutePreConfiguredActions<AuthorizeOptions>();
        }
    }
}