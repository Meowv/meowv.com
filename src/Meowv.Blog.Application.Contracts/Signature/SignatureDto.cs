using System;

namespace Meowv.Blog.Application.Contracts.Signature
{
    public class SignatureDto
    {
        /// <summary>
        /// 名字
        /// </summary>
        public string Name { get; set; }

        /// <summary>
        /// 类型
        /// </summary>
        public string Type { get; set; }

        /// <summary>
        /// URL
        /// </summary>
        public string Url { get; set; }

        /// <summary>
        /// IP
        /// </summary>
        public string Ip { get; set; }

        /// <summary>
        /// 日期
        /// </summary>
        public DateTime CreateTime { get; set; }
    }
}