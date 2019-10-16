using Microsoft.Extensions.Configuration;
using System.IO;

namespace MeowvBlog.Core.Configurations
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
        /// Sqlite 连接字符串
        /// </summary>
        public static string SqliteConnectionString => _config["SqliteConnectionString"];
    }
}