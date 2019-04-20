using MeowvBlog.Services.Dto.Articles.Params;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using System;
using System.Threading.Tasks;

namespace MeowvBlog.Services.Tests.Articles
{
    [TestClass]
    public class ArticleService : TestBase
    {
        /// <summary>
        /// 新增文章测试
        /// </summary>
        /// <returns></returns>
        [TestMethod]
        public async Task InsertArticle()
        {
            var input = new InsertArticleInput
            {
                Title = "标题标题标题标题标题",
                Author = "qix",
                Source = "Meowv",
                Url = "https://mewov.com",
                Summary = "简介简介简介简介简介",
                Content = "内容内容内容内容内容",
                MetaKeywords = "关键字1,关键字2,关键字3",
                MetaDescription = "我是一段描述",
                PostTime = DateTime.Now
            };

            var result = await _articleService.InsertAsync(input);

            Console.WriteLine(result.SerializeToJson());
        }
    }
}