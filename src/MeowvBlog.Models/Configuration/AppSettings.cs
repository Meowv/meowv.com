using Microsoft.Extensions.Configuration;
using System.IO;

namespace MeowvBlog.Models.Configuration
{
    public class AppSettings
    {
        private static readonly IConfigurationRoot _configurationRoot;

        static AppSettings()
        {
            var builder = new ConfigurationBuilder().SetBasePath(Directory.GetCurrentDirectory()).AddJsonFile("appsettings.json", optional: true, reloadOnChange: true);

            _configurationRoot = builder.Build();
        }

        /// <summary>
        /// MySql
        /// </summary>
        public static string MySqlConnectionString => _configurationRoot["ConnectionStrings:MySql"];
    }
}