using Microsoft.Extensions.Configuration;
using System;
using System.Collections.Generic;
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
        /// Sqlite
        /// </summary>
        public static string SqliteConnectionString => _config["SqliteConnectionString"];

        /// <summary>
        /// ApiVersion
        /// </summary>
        public static string ApiVersion => _config["ApiVersion"];

        /// <summary>
        /// JWT
        /// </summary>
        public static class JWT
        {
            public static string Domain => _config["JWT:Domain"];

            public static string SecurityKey => _config["JWT:SecurityKey"];

            public static int Expires => Convert.ToInt32(_config["JWT:Expires"]);
        }

        /// <summary>
        /// GitHub
        /// </summary>
        public static class GitHub
        {
            public static int Id => Convert.ToInt32(_config["Github:Id"]);

            public static string Client_ID => _config["Github:ClientID"];

            public static string Client_Secret => _config["Github:ClientSecret"];

            public static string Redirect_Uri => _config["Github:RedirectUri"];

            public static string ApplicationName => _config["Github:ApplicationName"];
        }

        /// <summary>
        /// MTA
        /// </summary>
        public static class MTA
        {
            public static string App_Id => _config["MTA:App_Id"];

            public static string SECRET_KEY => _config["MTA:SECRET_KEY"];
        }

        /// <summary>
        /// 微信
        /// </summary>
        public static class Weixin
        {
            public static string AppId => _config["Weixin:AppId"];

            public static string AppSecret => _config["Weixin:AppSecret"];
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

        /// <summary>
        /// 图集路径配置
        /// </summary>
        public static class Gallery
        {
            public static string AlbumPath => _config["Gallery:Album"];

            public static string ImagesPath => _config["Gallery:Images"];
        }

        /// <summary>
        /// 百度AI 语音合成
        /// </summary>
        public static class BaiduAI
        {
            public static string APIKey => _config["BaiduAI:APIKey"];

            public static string SecretKey => _config["BaiduAI:SecretKey"];
        }
    }
}