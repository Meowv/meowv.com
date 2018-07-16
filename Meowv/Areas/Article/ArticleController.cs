using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Meowv.Models.Article;
using Meowv.Models.JsonResult;
using Meowv.Processor.Cache;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Meowv.Areas.Article
{
    [ApiController, Route("[Controller]")]
    public class ArticleController : ControllerBase
    {
        public async Task<JsonResult<List<ArticleEntity>>> GetDailyArticle()
        {

        }

        public async Task<JsonResult<List<ArticleEntity>>> GetRandomArticle()
        {

        }

        public CacheObject<List<ArticleEntity>> GetJobCacheObject(int? minutes = null)
        {
            var key = Request.Path.Value + Request.QueryString.Value;
            var time = DateTime.Now.AddMinutes(minutes ?? 10) - DateTime.Now;
            return new CacheObject<List<ArticleEntity>>(key, time);
        }
    }
}