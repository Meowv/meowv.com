using Microsoft.Extensions.Configuration;
using System.IO;

namespace MeowvBlog.Core.Configuration
{
    /// <summary>
    /// 配置文件数据
    /// </summary>
    public class AppSettings
    {
        private static readonly IConfigurationRoot _configuration;

        static AppSettings()
        {
            var builder = new ConfigurationBuilder().SetBasePath(Directory.GetCurrentDirectory()).AddJsonFile("appsettings.json", optional: true, reloadOnChange: true);

            _configuration = builder.Build();
        }

        /// <summary>
        /// MySQL数据库连接字符串
        /// </summary>
        public static string MySqlConnectionString => _configuration["MySqlConnectionString"];

        /// <summary>
        /// SqlServer数据库连接字符串
        /// </summary>
        public static string SqlServerConnectionString => _configuration["SqlServerConnectionString"];
    }
}