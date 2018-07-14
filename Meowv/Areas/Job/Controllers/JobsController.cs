using AngleSharp.Parser.Html;
using Meowv.Models;
using Meowv.Processor.Job;
using Microsoft.AspNetCore.Mvc;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Threading.Tasks;

namespace Meowv.Areas.Job.Controllers
{
    [ApiController, Route("[Controller]")]
    public class JobsController : ControllerBase
    {
        /// <summary>
        /// 获取 智联招聘 招聘信息
        /// </summary>
        /// <param name="city"></param>
        /// <param name="key"></param>
        /// <param name="index"></param>
        /// <returns></returns>
        [HttpGet, Route("zhaopin")]
        public async Task<List<JobEntity>> GetJob_Zhaopin(string city, string key, int index)
        {
            var cache = GetJobCacheObject();
            var data = cache.GetData();
            if (data != null)
            {
                return data.Data;
            }

            var cityCode = JobCityCode.GetCityCode(JobRecruitment._zhaopin, city);
            var url = $"https://sou.zhaopin.com/jobs/searchresult.ashx?jl={cityCode}&kw={key}&p={index}";
            using (var http = new HttpClient())
            {
                var htmlContent = await http.GetStringAsync(url);
                HtmlParser parser = new HtmlParser();
                var jobInfos = parser.Parse(htmlContent)
                    .QuerySelectorAll(".newlist_list_content table")
                    .Where(x => x.QuerySelectorAll(".zwmc a").FirstOrDefault() != null)
                    .Select(x => new JobEntity()
                    {
                        PositionName = x.QuerySelectorAll(".zwmc a").FirstOrDefault().TextContent,
                        CompanyName = x.QuerySelectorAll(".gsmc a").FirstOrDefault().TextContent,
                        Salary = x.QuerySelectorAll(".zwyx").FirstOrDefault().TextContent,
                        WorkingPlace = x.QuerySelectorAll(".gzdd").FirstOrDefault().TextContent,
                        ReleaseDate = x.QuerySelectorAll(".gxsj span").FirstOrDefault().TextContent,
                        DetailUrl = x.QuerySelectorAll(".zwmc a").FirstOrDefault().Attributes.FirstOrDefault(d => d.Name == "href").Value,
                    })
                    .ToList();

                cache.AddData(jobInfos);
                return jobInfos;
            }
        }

        /// <summary>
        /// 获取缓存对象
        /// </summary>
        /// <param name="minutes"></param>
        /// <returns></returns>
        [NonAction]
        public JobCacheObject<List<JobEntity>> GetJobCacheObject(int? minutes = null)
        {
            var key = Request.Path.Value + Request.QueryString.Value;
            var time = DateTime.Now.AddMinutes(minutes ?? 10) - DateTime.Now;
            JobCacheObject<List<JobEntity>> obj = new JobCacheObject<List<JobEntity>>(key, time);
            return obj;
        }
    }
}