using MeowvBlog.EntityFrameworkCore;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.OpenApi.Models;
using Volo.Abp;
using Volo.Abp.AspNetCore.Mvc;
using Volo.Abp.Autofac;
using Volo.Abp.Modularity;

namespace MeowvBlog.Web
{
    [DependsOn(
        typeof(MeowvBlogHttpApiModule),
        typeof(MeowvBlogDomainModule),
        typeof(MeowvBlogEntityFrameworkCoreDbMigrationsModule),
        typeof(AbpAspNetCoreMvcModule),
        typeof(AbpAutofacModule)
        )]
    public class MeowvBlogWebModule : AbpModule
    {
        //public override void PreConfigureServices(ServiceConfigurationContext context)
        //{
        //    context.Services.PreConfigure<AbpMvcDataAnnotationsLocalizationOptions>(options =>
        //    {
        //        options.AddAssemblyResource(
        //            typeof(MeowvBlogResource),
        //            typeof(MeowvBlogDomainModule).Assembly,
        //            typeof(MeowvBlogDomainSharedModule).Assembly,

        //            typeof(MeowvBlogApplicationContractsModule).Assembly,
        //            typeof(MeowvBlogWebModule).Assembly
        //        );
        //    });
        //}

        public override void ConfigureServices(ServiceConfigurationContext context)
        {
            var hostingEnvironment = context.Services.GetHostingEnvironment();
            var configuration = context.Services.GetConfiguration();

            //ConfigureUrls(configuration);
            //ConfigureAuthentication(context, configuration);
            //ConfigureAutoMapper();
            //ConfigureVirtualFileSystem(hostingEnvironment);
            //ConfigureLocalizationServices();
            //ConfigureNavigationServices();
            //ConfigureAutoApiControllers();
            ConfigureSwaggerServices(context.Services);
        }

        //private void ConfigureUrls(IConfiguration configuration)
        //{
        //    Configure<AppUrlOptions>(options =>
        //    {
        //        options.Applications["MVC"].RootUrl = configuration["App:SelfUrl"];
        //    });
        //}

        //private void ConfigureAuthentication(ServiceConfigurationContext context, IConfiguration configuration)
        //{
        //    context.Services.AddAuthentication()
        //        .AddIdentityServerAuthentication(options =>
        //        {
        //            options.Authority = configuration["AuthServer:Authority"];
        //            options.RequireHttpsMetadata = false;
        //            options.ApiName = "MeowvBlog";
        //        });
        //}

        //private void ConfigureAutoMapper()
        //{
        //    Configure<AbpAutoMapperOptions>(options =>
        //    {
        //        options.AddMaps<MeowvBlogWebModule>();

        //    });
        //}

        //private void ConfigureVirtualFileSystem(IWebHostEnvironment hostingEnvironment)
        //{
        //    if (hostingEnvironment.IsDevelopment())
        //    {
        //        Configure<AbpVirtualFileSystemOptions>(options =>
        //        {
        //            options.FileSets.ReplaceEmbeddedByPhysical<MeowvBlogDomainSharedModule>(Path.Combine(hostingEnvironment.ContentRootPath, $"..{Path.DirectorySeparatorChar}MeowvBlog.Domain.Shared"));
        //            options.FileSets.ReplaceEmbeddedByPhysical<MeowvBlogDomainModule>(Path.Combine(hostingEnvironment.ContentRootPath, $"..{Path.DirectorySeparatorChar}MeowvBlog.Domain"));
        //            options.FileSets.ReplaceEmbeddedByPhysical<MeowvBlogApplicationContractsModule>(Path.Combine(hostingEnvironment.ContentRootPath, $"..{Path.DirectorySeparatorChar}MeowvBlog.Application.Contracts"));
        //            options.FileSets.ReplaceEmbeddedByPhysical<MeowvBlogApplicationModule>(Path.Combine(hostingEnvironment.ContentRootPath, $"..{Path.DirectorySeparatorChar}MeowvBlog.Application"));
        //            options.FileSets.ReplaceEmbeddedByPhysical<MeowvBlogWebModule>(hostingEnvironment.ContentRootPath);
        //        });
        //    }
        //}

        //private void ConfigureLocalizationServices()
        //{
        //    Configure<AbpLocalizationOptions>(options =>
        //    {
        //        options.Resources
        //            .Get<MeowvBlogResource>()
        //            .AddBaseTypes(
        //                typeof(AbpUiResource)
        //            );

        //        options.Languages.Add(new LanguageInfo("cs", "cs", "Čeština"));
        //        options.Languages.Add(new LanguageInfo("en", "en", "English"));
        //        options.Languages.Add(new LanguageInfo("pt-BR", "pt-BR", "Português"));
        //        options.Languages.Add(new LanguageInfo("tr", "tr", "Türkçe"));
        //        options.Languages.Add(new LanguageInfo("zh-Hans", "zh-Hans", "简体中文"));
        //        options.Languages.Add(new LanguageInfo("zh-Hant", "zh-Hant", "繁體中文"));
        //    });
        //}

        //private void ConfigureNavigationServices()
        //{
        //    Configure<AbpNavigationOptions>(options =>
        //    {
        //        options.MenuContributors.Add(new MeowvBlogMenuContributor());
        //    });
        //}

        //private void ConfigureAutoApiControllers()
        //{
        //    Configure<AbpAspNetCoreMvcOptions>(options =>
        //    {
        //        options.ConventionalControllers.Create(typeof(MeowvBlogApplicationModule).Assembly);
        //    });
        //}

        private void ConfigureSwaggerServices(IServiceCollection services)
        {
            services.AddSwaggerGen(
                options =>
                {
                    options.SwaggerDoc("v1", new OpenApiInfo { Title = "MeowvBlog API", Version = "v1" });
                    options.DocInclusionPredicate((docName, description) => true);
                    options.CustomSchemaIds(type => type.FullName);
                }
            );
        }

        public override void OnApplicationInitialization(ApplicationInitializationContext context)
        {
            var app = context.GetApplicationBuilder();
            var env = context.GetEnvironment();

            app.UseCorrelationId();

            if (env.IsDevelopment())
            {
                app.UseDeveloperExceptionPage();
            }

            app.UseRouting();
            app.UseSwagger();
            app.UseSwaggerUI(options =>
            {
                options.SwaggerEndpoint("/swagger/v1/swagger.json", "MeowvBlog API");
            });
            app.UseMvcWithDefaultRouteAndArea();
        }
    }
}