using Meowv.Models.Article;
using Meowv.Models.JsonResult;
using Meowv.Processor.Cache;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json.Linq;
using System;
using System.Net.Http;
using System.Threading.Tasks;

namespace Meowv.Areas.Article
{
    [ApiController, Route("[Controller]")]
    public class ArticleController : ControllerBase
    {
        /// <summary>
        /// 获取每日一文
        /// </summary>
        /// <returns></returns>
        [HttpGet, Route("today")]
        public async Task<JsonResult<ArticleEntity>> GetTodayArticle()
        {
            return await GetArticle("today");
        }

        /// <summary>
        /// 获取随机一文
        /// </summary>
        /// <returns></returns>
        [HttpGet, Route("random")]
        public async Task<JsonResult<ArticleEntity>> GetRandomArticle()
        {
            return await GetArticle("random");
        }

        [NonAction]
        public async Task<JsonResult<ArticleEntity>> GetArticle(string action)
        {
            try
            {
                var cache = GetArticleCacheObject();

                if (action == "today")
                {
                    var data = cache.GetData();
                    if (data != null)
                        return new JsonResult<ArticleEntity> { Result = data.Data };
                }

                var url = $"https://interface.meiriyiwen.com/article/{action}";
                using (var http = new HttpClient())
                {
                    var jsonContent = await http.GetStringAsync(url);

                    var obj = JObject.Parse(jsonContent);

                    var author = obj["data"]["author"].ToString();
                    var title = obj["data"]["title"].ToString();
                    var content = obj["data"]["content"].ToString();

                    var entity = new ArticleEntity
                    {
                        Author = author,
                        Title = title,
                        Content = content
                    };

                    cache.AddData(entity);

                    return new JsonResult<ArticleEntity> { Result = entity };
                }
            }
            catch (Exception e)
            {
                return new JsonResult<ArticleEntity> { Reason = e.Message };
            }
        }

        /// <summary>
        /// 获取缓存对象
        /// </summary>
        /// <param name="minutes">分钟</param>
        /// <returns></returns>
        [NonAction]
        public CacheObject<ArticleEntity> GetArticleCacheObject(int? minutes = null)
        {
            var key = Request.Path.Value + Request.QueryString.Value;
            var time = DateTime.Now.AddMinutes(minutes ?? 10) - DateTime.Now;
            return new CacheObject<ArticleEntity>(key, time);
        }
    }
}