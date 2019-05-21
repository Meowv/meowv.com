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
    }
}