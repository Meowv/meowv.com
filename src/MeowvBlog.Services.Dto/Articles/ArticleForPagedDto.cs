using MeowvBlog.Core.Domain.Articles;
using UPrime.AutoMapper;
using UPrime.Services.Dto;

namespace MeowvBlog.Services.Dto.Articles
{
    /// <summary>
    /// 一篇文章上一页下一页传输对象
    /// </summary>
    [AutoMapFrom(typeof(Article))]
    public class ArticleForPagedDto : EntityDto
    {
        /// <summary>
        /// 标题
        /// </summary>
        public string Title { get; set; }
    }
}