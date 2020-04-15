using Microsoft.Extensions.Configuration;
using System;
using System.Collections.Generic;
using System.IO;

namespace MeowvBlog.API.Configurations
{
    /// <summary>
    /// appsettings.json配置文件数据读取类
    /// </summary>
    public class AppSettings
    {
        /// <summary>
        /// 配置文件的根节点
        /// </summary>
        private static readonly IConfigurationRoot _config;

        /// <summary>
        /// Constructor
        /// </summary>
        static AppSettings()
        {
            // 加载appsettings.json，并构建IConfigurationRoot
            var builder = new ConfigurationBuilder().SetBasePath(Directory.GetCurrentDirectory())
                                                    .AddJsonFile("Resources/appsettings.json", true, true);
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

        /// <summary>
        /// 腾讯云API
        /// </summary>
        public static class TencentCloud
        {
            public static string SecretId => _config["TencentCloud:SecretId"];

            public static string SecretKey => _config["TencentCloud:SecretKey"];

            public static class Captcha
            {
                public static string APIKey => _config["TencentCloud:Captcha:AppId"];

                public static string SecretKey => _config["TencentCloud:Captcha:AppSecret"];
            }
        }

        /// <summary>
        /// RemoveBg
        /// </summary>
        public static class RemoveBg
        {
            public static string Secret => _config["RemoveBg:Secret"];

            public static string URL => _config["RemoveBg:URL"];
        }

        /// <summary>
        /// FM Api
        /// </summary>
        public static class FMApi
        {
            public static string Key => _config["FMApi:Key"];

            public static string Channels => _config["FMApi:Channels"];

            public static string Song => _config["FMApi:Song"];

            public static string Lyric => _config["FMApi:Lyric"];
        }

        /// <summary>
        /// 脚本参数
        /// </summary>
        public static class Job
        {
            /// <summary>
            /// 要访问的URL
            /// </summary>
            public static string Url => _config["Job:Url"];

            /// <summary>
            /// 每天的开始执行时间(几时)
            /// </summary>
            public static int ExecutionTime => Convert.ToInt32(_config["Job:ExecutionTime"]);

            /// <summary>
            /// 每次执行的延迟时间(毫秒)
            /// </summary>
            public static int MillisecondsDelay => Convert.ToInt32(_config["Job:MillisecondsDelay"]);
        }

        /// <summary>
        /// Email配置
        /// </summary>
        public static class Email
        {
            /// <summary>
            /// Host
            /// </summary>
            public static string Host => _config["Email:Host"];

            /// <summary>
            /// Port
            /// </summary>
            public static int Port => Convert.ToInt32(_config["Email:Port"]);

            /// <summary>
            /// UseSsl
            /// </summary>
            public static bool UseSsl => Convert.ToBoolean(_config["Email:UseSsl"]);

            /// <summary>
            /// From
            /// </summary>
            public static class From
            {
                /// <summary>
                /// Username
                /// </summary>
                public static string Username => _config["Email:From:Username"];

                /// <summary>
                /// Password
                /// </summary>
                public static string Password => _config["Email:From:Password"];

                /// <summary>
                /// Name
                /// </summary>
                public static string Name => _config["Email:From:Name"];

                /// <summary>
                /// Address
                /// </summary>
                public static string Address => _config["Email:From:Address"];
            }

            /// <summary>
            /// To
            /// </summary>
            public static IDictionary<string, string> To
            {
                get
                {
                    var dic = new Dictionary<string, string>();

                    var emails = _config.GetSection("Email:To");
                    foreach (IConfigurationSection section in emails.GetChildren())
                    {
                        var name = section["Name"];
                        var address = section["Address"];

                        dic.Add(name, address);
                    }
                    return dic;
                }
            }

            /// <summary>
            /// Subject
            /// </summary>
            public static string Subject => _config["Email:Subject"];
        }
    }
}