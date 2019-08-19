using Swashbuckle.AspNetCore.Swagger;
using Swashbuckle.AspNetCore.SwaggerGen;
using System.Collections.Generic;
using System.Linq;

namespace MeowvBlog.Web.Filters
{
    public class TagDescriptionsFilter : IDocumentFilter
    {
        public void Apply(SwaggerDocument swaggerDoc, DocumentFilterContext context)
        {
            var tags = new List<Tag>
            {
                new Tag
                {
                    Name = "Account",
                    Description = "Account验证接口"
                },
                new Tag
                {
                    Name = "Apps",
                    Description = "一些通用接口"
                },
                new Tag
                {
                    Name = "Blog",
                    Description = "个人博客接口"
                },
                new Tag
                {
                    Name = "Commits",
                    Description = "Commits提交历史记录接口"
                },
                new Tag
                {
                    Name = "HotNews",
                    Description = "热门新闻数据接口"
                },
                new Tag
                {
                    Name = "MTA",
                    Description = "腾讯MTA网站数据分析接口"
                },
                new Tag
                {
                    Name = "NiceArticle",
                    Description = "一些比较好的文章接口"
                },
                new Tag
                {
                    Name = "Signature",
                    Description = "个性签名接口"
                }
            };

            swaggerDoc.Tags = tags.OrderBy(x => x.Name).ToList();
        }
    }
}