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

            var sckey = configuration.GetValue<string>("sckey");

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
                var dingtalkOption = authorizeOption.GetSection("dingtalk");
                var microsoftOption = authorizeOption.GetSection("microsoft");
                var weiboOptions = authorizeOption.GetSection("weibo");
                var qqOptions = authorizeOption.GetSection("qq");

                Configure<AuthorizeOptions>(authorizeOption);
                Configure<GithubOptions>(githubOption);
                Configure<GiteeOptions>(giteeOption);
                Configure<AlipayOptions>(alipayOption);
                Configure<DingtalkOptions>(dingtalkOption);
                Configure<MicrosoftOptions>(microsoftOption);
                Configure<WeiboOptions>(weiboOptions);
                Configure<QQOptions>(qqOptions);

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
                    RedirectUrl = alipayOption.GetValue<string>(nameof(options.Alipay.RedirectUrl)),
                    Scope = alipayOption.GetValue<string>(nameof(options.Alipay.Scope)),
                    PrivateKey = alipayOption.GetValue<string>(nameof(options.Alipay.PrivateKey)),
                    PublicKey = alipayOption.GetValue<string>(nameof(options.Alipay.PublicKey))
                };
                options.Dingtalk = new DingtalkOptions
                {
                    AppId = dingtalkOption.GetValue<string>(nameof(options.Dingtalk.AppId)),
                    AppSecret = dingtalkOption.GetValue<string>(nameof(options.Dingtalk.AppSecret)),
                    RedirectUrl = dingtalkOption.GetValue<string>(nameof(options.Dingtalk.RedirectUrl)),
                    Scope = dingtalkOption.GetValue<string>(nameof(options.Dingtalk.Scope))
                };
                options.Microsoft = new MicrosoftOptions
                {
                    ClientId = microsoftOption.GetValue<string>(nameof(options.Microsoft.ClientId)),
                    ClientSecret = microsoftOption.GetValue<string>(nameof(options.Microsoft.ClientSecret)),
                    RedirectUrl = microsoftOption.GetValue<string>(nameof(options.Microsoft.RedirectUrl)),
                    Scope = microsoftOption.GetValue<string>(nameof(options.Microsoft.Scope))
                };
                options.Weibo = new WeiboOptions
                {
                    ClientId = weiboOptions.GetValue<string>(nameof(options.Weibo.ClientId)),
                    ClientSecret = weiboOptions.GetValue<string>(nameof(options.Weibo.ClientSecret)),
                    RedirectUrl = weiboOptions.GetValue<string>(nameof(options.Weibo.RedirectUrl)),
                    Scope = weiboOptions.GetValue<string>(nameof(options.Weibo.Scope))
                };
                options.QQ = new QQOptions
                {
                    ClientId = qqOptions.GetValue<string>(nameof(options.QQ.ClientId)),
                    ClientSecret = qqOptions.GetValue<string>(nameof(options.QQ.ClientSecret)),
                    RedirectUrl = qqOptions.GetValue<string>(nameof(options.QQ.RedirectUrl)),
                    Scope = qqOptions.GetValue<string>(nameof(options.QQ.Scope))
                };

                authorize = options;
            });
            PreConfigure<AppOptions>(options =>
            {
                options.Swagger = swagger;
                options.ScKey = sckey;
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
                    item.ScKey = sckey;
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