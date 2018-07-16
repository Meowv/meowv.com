using Meowv.Models.JsonResult;
using Meowv.Models.News;
using Meowv.Processor.Cache;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json.Linq;
using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Threading.Tasks;

namespace Meowv.Areas.News
{
    [ApiController, Route("[Controller]")]
    public class NewsController : ControllerBase
    {
        /// <summary>
        /// 获取 V2EX 数据
        /// </summary>
        /// <returns></returns>
        [HttpGet, Route("v2ex")]
        public async Task<JsonResult<List<NewsEntity>>> GetV2ex()
        {
            try
            {
                var cache = GetV2exCacheObject();
                var data = cache.GetData();
                if (data != null)
                    return new JsonResult<List<NewsEntity>> { Result = data.Data };

                var tempList = new List<string>();
                var list = new List<NewsEntity>();
                var isExist = false;

                var api = "https://www.v2ex.com/api/topics";
                using (var http = new HttpClient())
                {
                    var hotJsonContent = await http.GetStringAsync($"{api}/hot.json");
                    var latestJsonContent = await http.GetStringAsync($"{api}/latest.json");

                    var hotList = JArray.Parse(hotJsonContent);
                    var latestList = JArray.Parse(latestJsonContent);

                    foreach (var item in hotList)
                    {
                        var entity = new NewsEntity
                        {
                            Title = item["title"].ToString(),
                            Url = item["url"].ToString()
                        };

                        list.Add(entity);
                        tempList.Add(item["id"].ToString());
                    }

                    foreach (var item in latestList)
                    {
                        foreach (var temp in tempList)
                        {
                            if (item["id"].ToString() == temp)
                            {
                                isExist = !isExist;
                            }
                        }

                        if (!isExist)
                        {
                            var entity = new NewsEntity
                            {
                                Title = item["title"].ToString(),
                                Url = item["url"].ToString()
                            };
                            list.Add(entity);
                        }
                    }

                    return new JsonResult<List<NewsEntity>> { Result = list };
                }
            }
            catch (Exception e)
            {
                return new JsonResult<List<NewsEntity>> { Reason = e.Message };
            }
        }

        /// <summary>
        /// 获取缓存对象
        /// </summary>
        /// <param name="minutes">分钟</param>
        /// <returns></returns>
        [NonAction]
        public CacheObject<List<NewsEntity>> GetV2exCacheObject(int? minutes = null)
        {
            var key = Request.Path.Value + Request.QueryString.Value;
            var time = DateTime.Now.AddMinutes(minutes ?? 10) - DateTime.Now;
            return new CacheObject<List<NewsEntity>>(key, time);
        }
    }
}