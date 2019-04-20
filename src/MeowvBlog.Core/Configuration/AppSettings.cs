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
            var builder = new ConfigurationBuilder().SetBasePath(Directory.GetCurrentDirectory()).AddJsonFile("uprimeSettings.json", optional: true, reloadOnChange: true);

            _configuration = builder.Build();
        }

        /// <summary>
        /// 数据库类型
        /// MySQL/SqlServer
        /// </summary>
        public static string DbType => _configuration["DbType"];

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