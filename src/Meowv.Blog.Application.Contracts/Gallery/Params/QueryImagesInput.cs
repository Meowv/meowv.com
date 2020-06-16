using System;

namespace Meowv.Blog.Application.Contracts.Gallery.Params
{
    public class QueryImagesInput
    {
        /// <summary>
        /// Id
        /// </summary>
        public Guid Id { get; set; }

        /// <summary>
        /// 密码
        /// </summary>
        public string Password { get; set; }
    }
}