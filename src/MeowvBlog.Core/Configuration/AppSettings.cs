using Microsoft.Extensions.Configuration;
using System.IO;

namespace MeowvBlog.Core.Configuration
{
    public class AppSettings
    {
        private static readonly IConfigurationRoot _config;

        static AppSettings()
        {
            var builder = new ConfigurationBuilder().SetBasePath(Directory.GetCurrentDirectory())
                                                    .AddJsonFile("appsettings.json", true, true);

            _config = builder.Build();
        }

        /// <summary>
        /// MySql
        /// </summary>
        public static string MySqlConnectionString => _config["ConnectionStrings:MySql"];

        /// <summary>
        /// GitHub 授权配置
        /// </summary>
        public static class GitHub
        {
            public static string Client_ID => _config["Github:ClientID"];

            public static string Client_Secret => _config["Github:ClientSecret"];

            public static string Redirect_Uri => _config["Github:RedirectUri"];

            public static string ApplicationName => _config["Github:ApplicationName"];
        }
    }
}