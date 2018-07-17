using AngleSharp.Parser.Html;
using Meowv.Models.JsonResult;
using Meowv.Models.News;
using Meowv.Processor.Cache;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json.Linq;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Threading.Tasks;
using System.Xml;

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

                    cache.AddData(list);

                    return new JsonResult<List<NewsEntity>> { Result = list };
                }
            }
            catch (Exception e)
            {
                return new JsonResult<List<NewsEntity>> { Reason = e.Message };
            }
        }

        /// <summary>
        /// 获取 博客园 数据
        /// </summary>
        /// <returns></returns>
        [HttpGet, Route("cnblogs")]
        public async Task<JsonResult<List<NewsEntity>>> GetCnBlogs()
        {
            try
            {
                var cache = GetV2exCacheObject();
                var data = cache.GetData();
                if (data != null)
                    return new JsonResult<List<NewsEntity>> { Result = data.Data };

                var url = "https://www.cnblogs.com/";
                using (var http = new HttpClient())
                {
                    var htmlContent = await http.GetStringAsync(url);

                    var parser = new HtmlParser();
                    var list = parser.Parse(htmlContent)
                        .QuerySelectorAll("#post_list .post_item")
                        .Select(x => new NewsEntity()
                        {
                            Title = x.QuerySelectorAll(".post_item_body h3 a").FirstOrDefault().TextContent.Trim(),
                            Url = x.QuerySelectorAll(".post_item_body h3 a").FirstOrDefault().Attributes.FirstOrDefault(d => d.Name == "href").Value.Trim()
                        }).ToList();

                    cache.AddData(list);

                    return new JsonResult<List<NewsEntity>> { Result = list };
                }
            }
            catch (Exception e)
            {
                return new JsonResult<List<NewsEntity>> { Reason = e.Message };
            }
        }

        /// <summary>
        /// 获取 IT之家 数据
        /// </summary>
        /// <returns></returns>
        [HttpGet, Route("ithome")]
        public async Task<JsonResult<List<NewsEntity>>> GetItHome()
        {
            try
            {
                var cache = GetV2exCacheObject();
                var data = cache.GetData();
                if (data != null)
                    return new JsonResult<List<NewsEntity>> { Result = data.Data };

                var url = "http://api.ithome.com/xml/newslist/news.xml";
                using (var http = new HttpClient())
                {
                    var xmlContent = await http.GetStringAsync(url);

                    var xmlDoc = new XmlDocument();
                    xmlDoc.LoadXml(xmlContent);

                    var list = new List<NewsEntity>();

                    var xmlNodeList = xmlDoc.SelectNodes("/rss/channel/item");
                    if (xmlNodeList != null)
                    {
                        foreach (XmlNode xmlNode in xmlNodeList)
                        {
                            var entity = new NewsEntity();
                            foreach (XmlElement xmlElement in xmlNode.ChildNodes)
                            {
                                switch (xmlElement.Name)
                                {
                                    case "title":
                                        entity.Title = xmlElement.InnerText;
                                        break;
                                    case "url":
                                        entity.Url = xmlElement.InnerText.Contains("http") ? xmlElement.InnerText : "https://www.ithome.com" + xmlElement.InnerText;
                                        break;
                                    default:
                                        break;
                                }
                            }
                            list.Add(entity);
                        }
                    }

                    cache.AddData(list);

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