using Meowv.Models.Blog;
using Meowv.Models.JsonResult;
using Meowv.Processor.Cache;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using System.Xml;

namespace Meowv.Areas.Blog
{
    [ApiController, Route("[Controller]")]
    public class BlogController : ControllerBase
    {
        private IHostingEnvironment _hostingEnvironment;

        public BlogController(IHostingEnvironment hostingEnvironment)
        {
            _hostingEnvironment = hostingEnvironment;
        }

        /// <summary>
        /// 获取博客所有文章
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        public async Task<JsonResult<List<BlogEntity>>> GetBlogArticle()
        {
            try
            {
                var cache = GetBlogCacheObject();
                var data = cache.GetData();
                if (data != null)
                    return new JsonResult<List<BlogEntity>> { Result = data.Data };

                var blogXmlPath = $"{_hostingEnvironment.ContentRootPath}/XmlData/blog.xml";
                var xmlContent = await System.IO.File.ReadAllTextAsync(blogXmlPath);

                xmlContent = xmlContent.Replace(" xmlns=\"http://www.w3.org/2005/Atom\"", "");

                var xmlDoc = new XmlDocument();
                xmlDoc.LoadXml(xmlContent);

                var list = new List<BlogEntity>();

                var xmlNodeList = xmlDoc.SelectNodes("/feed/entry");
                if (xmlNodeList != null)
                {
                    foreach (XmlNode xmlNode in xmlNodeList)
                    {
                        if (xmlNode.HasChildNodes)
                        {
                            var entity = new BlogEntity();
                            foreach (XmlElement xmlElement in xmlNode.ChildNodes)
                            {
                                switch (xmlElement.Name)
                                {
                                    case "title":
                                        entity.Title = xmlElement.InnerText;
                                        break;
                                    case "link":
                                        if (xmlElement.HasAttributes)
                                        {
                                            foreach (XmlAttribute xmlAttr in xmlElement.Attributes)
                                            {
                                                if (xmlAttr.Name == "href")
                                                {
                                                    entity.Url = xmlAttr.InnerText;
                                                }
                                            }
                                        }
                                        break;
                                    default:
                                        break;
                                }
                            }
                            list.Add(entity);
                        }
                    }
                }

                cache.AddData(list);

                return new JsonResult<List<BlogEntity>> { Result = list };
            }
            catch (Exception e)
            {
                return new JsonResult<List<BlogEntity>> { Reason = e.Message };
            }
        }

        /// <summary>
        /// 获取缓存对象
        /// </summary>
        /// <param name="minutes">分钟</param>
        /// <returns></returns>
        [NonAction]
        public CacheObject<List<BlogEntity>> GetBlogCacheObject(int? minutes = null)
        {
            var key = Request.Path.Value + Request.QueryString.Value;
            var time = DateTime.Now.AddMinutes(minutes ?? 10) - DateTime.Now;
            return new CacheObject<List<BlogEntity>>(key, time);
        }
    }
}