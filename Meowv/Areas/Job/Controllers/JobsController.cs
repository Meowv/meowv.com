using AngleSharp.Parser.Html;
using Meowv.Models.Job;
using Meowv.Models.JsonResult;
using Meowv.Processor.Job;
using Microsoft.AspNetCore.Mvc;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;

namespace Meowv.Areas.Job.Controllers
{
    [ApiController, Route("[Controller]")]
    public class JobsController : ControllerBase
    {
        /// <summary>
        /// 获取 智联招聘 招聘数据
        /// </summary>
        /// <param name="city">城市</param>
        /// <param name="key">关键词</param>
        /// <param name="index">页码</param>
        /// <returns></returns>
        [HttpGet, Route("zhaopin")]
        public async Task<JsonResult<List<JobEntity>>> GetJob_Zhaopin(string city, string key, int index)
        {
            try
            {
                var cache = GetJobCacheObject();
                var data = cache.GetData();
                if (data != null)
                    return new JsonResult<List<JobEntity>> { Result = data.Data };

                var cityCode = JobCityCode.GetCityCode(JobRecruitment._zhaopin, city);
                var url = $"http://sou.zhaopin.com/jobs/searchresult.ashx?jl={cityCode}&kw={key}&p={index}";
                using (var http = new HttpClient())
                {
                    var htmlContent = await http.GetStringAsync(url);
                    var parser = new HtmlParser();
                    var jobInfos = parser.Parse(htmlContent)
                        .QuerySelectorAll(".newlist_list_content table")
                        .Where(x => x.QuerySelectorAll(".zwmc a").FirstOrDefault() != null)
                        .Select(x => new JobEntity()
                        {
                            PositionName = x.QuerySelectorAll(".zwmc a").FirstOrDefault().TextContent.Trim(),
                            CompanyName = x.QuerySelectorAll(".gsmc a").FirstOrDefault().TextContent,
                            Salary = x.QuerySelectorAll(".zwyx").FirstOrDefault().TextContent,
                            WorkingPlace = x.QuerySelectorAll(".gzdd").FirstOrDefault().TextContent,
                            ReleaseDate = x.QuerySelectorAll(".gxsj span").FirstOrDefault().TextContent,
                            DetailUrl = x.QuerySelectorAll(".zwmc a").FirstOrDefault().Attributes.FirstOrDefault(d => d.Name == "href").Value,
                        }).ToList();

                    cache.AddData(jobInfos);

                    return new JsonResult<List<JobEntity>> { Result = jobInfos };
                }
            }
            catch (Exception e)
            {
                return new JsonResult<List<JobEntity>> { Reason = e.Message };
            }
        }

        /// <summary>
        /// 获取 智联招聘 招聘详情数据
        /// </summary>
        /// <param name="url">详情页URL</param>
        /// <returns></returns>
        [HttpGet, Route("zhaopin_detail")]
        public async Task<JsonResult<JobDetailEntity>> GetJob_Zhaopin(string url)
        {
            try
            {
                using (var http = new HttpClient())
                {
                    var htmlContent = await http.GetStringAsync(url);
                    var parser = new HtmlParser();
                    var jobDetailInfo = parser.Parse(htmlContent)
                        .QuerySelectorAll(".terminalpage")
                        .Where(x => x.QuerySelectorAll(".terminalpage-left .terminal-ul li").FirstOrDefault() != null)
                        .Select(x => new JobDetailEntity()
                        {
                            Experience = x.QuerySelectorAll(".terminalpage-left .terminal-ul li")[4].TextContent,
                            Education = x.QuerySelectorAll(".terminalpage-left .terminal-ul li")[5].TextContent,
                            CompanyNature = x.QuerySelectorAll(".terminalpage-right .terminal-company li")[1].TextContent,
                            CompanySize = x.QuerySelectorAll(".terminalpage-right .terminal-company li")[0].TextContent,
                            Requirement = x.QuerySelectorAll(".tab-cont-box .tab-inner-cont")[0].TextContent.Replace("职位描述：", ""),
                            CompanyIntroducation = x.QuerySelectorAll(".tab-cont-box .tab-inner-cont")[1].TextContent,
                        }).FirstOrDefault();

                    return new JsonResult<JobDetailEntity> { Result = jobDetailInfo };
                }
            }
            catch (Exception e)
            {
                return new JsonResult<JobDetailEntity> { Reason = e.Message };
            }
        }

        /// <summary>
        /// 获取 前程无忧 招聘数据
        /// </summary>
        /// <param name="city">城市</param>
        /// <param name="key">关键词</param>
        /// <param name="index">页码</param>
        /// <returns></returns>
        [HttpGet, Route("51job")]
        public async Task<JsonResult<List<JobEntity>>> GetJob_51Job(string city, string key, int index)
        {
            try
            {
                var cache = GetJobCacheObject();
                var data = cache.GetData();
                if (data != null)
                    return new JsonResult<List<JobEntity>> { Result = data.Data };

                var cityCode = JobCityCode.GetCityCode(JobRecruitment._51job, city);
                var url = $"http://search.51job.com/jobsearch/search_result.php?jobarea={cityCode}&keyword={key}&curr_page={index}";
                using (var http = new HttpClient())
                {
                    var htmlBytes = await http.GetByteArrayAsync(url);
                    var htmlContent = Encoding.GetEncoding("GBK").GetString(htmlBytes);
                    var parser = new HtmlParser();
                    var jobInfos = (await parser.ParseAsync(htmlContent))
                        .QuerySelectorAll(".dw_table div.el")
                        .Where(x => x.QuerySelectorAll(".t1 span a").FirstOrDefault() != null)
                        .Select(x => new JobEntity()
                        {
                            PositionName = x.QuerySelectorAll(".t1 span a").FirstOrDefault().TextContent.Trim(),
                            CompanyName = x.QuerySelectorAll(".t2 a").FirstOrDefault().TextContent,
                            Salary = x.QuerySelectorAll(".t3").FirstOrDefault().TextContent,
                            WorkingPlace = x.QuerySelectorAll(".t4").FirstOrDefault().TextContent,
                            ReleaseDate = x.QuerySelectorAll(".t5").FirstOrDefault().TextContent,
                            DetailUrl = x.QuerySelectorAll(".t1 span a").FirstOrDefault().Attributes.FirstOrDefault(d => d.Name == "href").Value
                        }).ToList();

                    cache.AddData(jobInfos);

                    return new JsonResult<List<JobEntity>> { Result = jobInfos };
                }
            }
            catch (Exception e)
            {
                return new JsonResult<List<JobEntity>> { Reason = e.Message };
            }
        }

        /// <summary>
        /// 获取 前程无忧 招聘详情数据
        /// </summary>
        /// <param name="url">详情页URL</param>
        /// <returns></returns>
        [HttpGet, Route("51job_detail")]
        public async Task<JsonResult<JobDetailEntity>> GetJob_51Job(string url)
        {
            try
            {
                using (var http = new HttpClient())
                {
                    var htmlBytes = await http.GetByteArrayAsync(url);
                    var htmlContent = Encoding.GetEncoding("GBK").GetString(htmlBytes);
                    var parser = new HtmlParser();
                    var jobDetailInfo = parser.Parse(htmlContent)
                        .QuerySelectorAll(".tCompanyPage")
                        .Where(x => x.QuerySelectorAll(".tBorderTop_box .t1 span").FirstOrDefault() != null)
                        .Select(x => new JobDetailEntity()
                        {
                            Experience = x.QuerySelectorAll(".tBorderTop_box .t1 span")[0].TextContent,
                            Education = x.QuerySelectorAll(".tBorderTop_box .t1 span")[1].TextContent,
                            CompanyNature = x.QuerySelectorAll(".msg.ltype")[0].TextContent.Split('|')[0].Trim(),
                            CompanySize = x.QuerySelectorAll(".msg.ltype")[0].TextContent.Split('|')[1].Trim(),
                            Requirement = x.QuerySelectorAll(".bmsg.job_msg.inbox")[0].TextContent.Replace("职位描述：", ""),
                            CompanyIntroducation = x.QuerySelectorAll(".tmsg.inbox")[0].TextContent,
                        }).FirstOrDefault();

                    return new JsonResult<JobDetailEntity> { Result = jobDetailInfo };
                }
            }
            catch (Exception e)
            {
                return new JsonResult<JobDetailEntity> { Reason = e.Message };
            }
        }

        /// <summary>
        /// 获取 猎聘网 招聘数据
        /// </summary>
        /// <param name="city">城市</param>
        /// <param name="key">关键词</param>
        /// <param name="index">页码</param>
        /// <returns></returns>
        [HttpGet, Route("liepin")]
        public async Task<JsonResult<List<JobEntity>>> GetJob_Liepin(string city, string key, int index)
        {
            try
            {
                var cache = GetJobCacheObject();
                var data = cache.GetData();
                if (data != null)
                    return new JsonResult<List<JobEntity>> { Result = data.Data };

                var cityCode = JobCityCode.GetCityCode(JobRecruitment._liepin, city);
                var url = $"http://www.liepin.com/zhaopin/?key={key}&dqs={cityCode}&curPage={index}";
                using (var http = new HttpClient())
                {
                    var htmlContent = await http.GetStreamAsync(url);
                    var parser = new HtmlParser();
                    var jobInfos = parser.Parse(htmlContent)
                        .QuerySelectorAll("ul.sojob-list li")
                        .Where(x => x.QuerySelectorAll(".job-info h3 a").FirstOrDefault() != null)
                        .Select(x => new JobEntity()
                        {
                            PositionName = x.QuerySelectorAll(".job-info h3 a").FirstOrDefault().TextContent.Trim(),
                            CompanyName = x.QuerySelectorAll(".company-name a").FirstOrDefault().TextContent,
                            Salary = x.QuerySelectorAll(".text-warning").FirstOrDefault().TextContent,
                            WorkingPlace = x.QuerySelectorAll(".area").FirstOrDefault().TextContent,
                            ReleaseDate = x.QuerySelectorAll(".time-info time").FirstOrDefault().TextContent,
                            DetailUrl = x.QuerySelectorAll(".job-info h3 a").FirstOrDefault().Attributes.FirstOrDefault(d => d.Name == "href").Value
                        }).ToList();

                    cache.AddData(jobInfos);

                    return new JsonResult<List<JobEntity>> { Result = jobInfos };
                }
            }
            catch (Exception e)
            {
                return new JsonResult<List<JobEntity>> { Reason = e.Message };
            }
        }

        /// <summary>
        /// 获取 猎聘网 招聘详情数据
        /// </summary>
        /// <param name="url">详情页URL</param>
        /// <returns></returns>
        [HttpGet, Route("liepin_detail")]
        public async Task<JsonResult<JobDetailEntity>> GetJob_Liepin(string url)
        {
            try
            {
                using (var http = new HttpClient())
                {
                    var htmlContent = await http.GetStreamAsync(url);
                    var parser = new HtmlParser();
                    var jobDetailInfo = parser.Parse(htmlContent)
                        .QuerySelectorAll(".wrap")
                        .Where(x => x.QuerySelectorAll(".job-qualifications").FirstOrDefault() != null)
                        .Select(x => new JobDetailEntity()
                        {
                            Experience = x.QuerySelectorAll(".job-qualifications span")[1].TextContent,
                            Education = x.QuerySelectorAll(".job-qualifications span")[0].TextContent,
                            CompanyNature = x.QuerySelectorAll(".new-compintro li")[0].TextContent,
                            CompanySize = x.QuerySelectorAll(".new-compintro li")[1].TextContent,
                            Requirement = x.QuerySelectorAll(".job-item.main-message").FirstOrDefault().TextContent.Replace("职位描述：", ""),
                            CompanyIntroducation = x.QuerySelectorAll(".job-item.main-message.noborder").FirstOrDefault().TextContent
                        }).FirstOrDefault();

                    return new JsonResult<JobDetailEntity> { Result = jobDetailInfo };
                }
            }
            catch (Exception e)
            {
                return new JsonResult<JobDetailEntity> { Reason = e.Message };
            }
        }

        /// <summary>
        /// 获取 Boss直聘 招聘数据
        /// </summary>
        /// <param name="city">城市</param>
        /// <param name="key">关键词</param>
        /// <param name="index">页码</param>
        /// <returns></returns>
        [HttpGet, Route("zhipin")]
        public async Task<JsonResult<List<JobEntity>>> GetJob_Zhipin(string city, string key, int index)
        {
            try
            {
                var cache = GetJobCacheObject();
                var data = cache.GetData();
                if (data != null)
                    return new JsonResult<List<JobEntity>> { Result = data.Data };

                var cityCode = JobCityCode.GetCityCode(JobRecruitment._zhipin, city);
                var url = $"http://www.zhipin.com/c{cityCode}/h_{cityCode}/?query={key}&page={1}";
                using (var http = new HttpClient())
                {
                    var htmlContent = await http.GetStreamAsync(url);
                    var parser = new HtmlParser();
                    var jobInfos = parser.Parse(htmlContent)
                        .QuerySelectorAll(".job-list ul li")
                        .Where(x => x.QuerySelectorAll(".info-primary h3").FirstOrDefault() != null)
                        .Select(x => new JobEntity()
                        {
                            PositionName = x.QuerySelectorAll(".info-primary h3 .job-title").FirstOrDefault().TextContent.Trim(),
                            CompanyName = x.QuerySelectorAll(".company-text h3").FirstOrDefault().TextContent,
                            Salary = x.QuerySelectorAll(".info-primary h3 .red").FirstOrDefault().TextContent,
                            WorkingPlace = x.QuerySelectorAll(".info-primary p").FirstOrDefault().TextContent.Split("  ")[0],
                            ReleaseDate = x.QuerySelectorAll(".info-publis p").FirstOrDefault().TextContent.Replace("发布于", ""),
                            DetailUrl = $"http://www.zhipin.com{x.QuerySelectorAll("a").FirstOrDefault().Attributes.FirstOrDefault(d => d.Name == "href").Value}"
                        }).ToList();

                    cache.AddData(jobInfos);

                    return new JsonResult<List<JobEntity>> { Result = jobInfos };
                }
            }
            catch (Exception e)
            {
                return new JsonResult<List<JobEntity>> { Reason = e.Message };
            }
        }


        /// <summary>
        /// 获取缓存对象
        /// </summary>
        /// <param name="minutes">分钟</param>
        /// <returns></returns>
        [NonAction]
        public JobCacheObject<List<JobEntity>> GetJobCacheObject(int? minutes = null)
        {
            var key = Request.Path.Value + Request.QueryString.Value;
            var time = DateTime.Now.AddMinutes(minutes ?? 10) - DateTime.Now;
            return new JobCacheObject<List<JobEntity>>(key, time);
        }
    }
}