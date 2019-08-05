using Microsoft.Extensions.Configuration;
using System.Collections.Generic;
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
        /// 是否开发环境
        /// </summary>
        public static bool IsDev => _config["IsDev"].ToBool();

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

        /// <summary>
        /// MTA 配置
        /// </summary>
        public static class MTA
        {
            public static string App_Id => _config["MTA:App_Id"];

            public static string SECRET_KEY => _config["MTA:SECRET_KEY"];
        }

        /// <summary>
        /// 个性签名配置
        /// </summary>
        public static class Signature
        {
            public static string Path => _config["Signature:Path"];

            public static IDictionary<string, string> Urls
            {
                get
                {
                    var dic = new Dictionary<string, string>();

                    var urls = _config.GetSection("Signature:Urls");
                    foreach (IConfigurationSection section in urls.GetChildren())
                    {
                        var url = section["Url"];
                        var parameter = section["Parameter"];

                        dic.Add(url, parameter);
                    }
                    return dic;
                }
            }
        }
    }
}