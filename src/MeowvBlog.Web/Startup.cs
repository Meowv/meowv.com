using MeowvBlog.IRepository;
using MeowvBlog.IRepository.Blog;
using MeowvBlog.IServices.Post;
using MeowvBlog.Models.Configuration;
using MeowvBlog.Repository.MySql;
using MeowvBlog.Services.Post;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using System;

namespace MeowvBlog.Web
{
    public class Startup
    {
        public void ConfigureServices(IServiceCollection services)
        {
            services.AddDbContext<MeowvBlogDbContext>(options =>
                     options.UseLazyLoadingProxies()
                            .UseMySql(AppSettings.MySqlConnectionString, sqlOptions =>
                            {
                                sqlOptions.EnableRetryOnFailure(
                                    maxRetryCount: 3,
                                    maxRetryDelay: TimeSpan.FromSeconds(30),
                                    errorNumbersToAdd: null);
                            }));

            services.AddMvc();
        }

        public void Configure(IApplicationBuilder app, IHostingEnvironment env)
        {
            if (env.IsDevelopment())
            {
                app.UseDeveloperExceptionPage();
            }

            app.UseMvcWithDefaultRoute();
        }
    }
}