using MeowvBlog.API.Configurations;
using MeowvBlog.API.Extensions;
using Microsoft.AspNetCore.Mvc;
using System.Collections.Generic;
using System.Net.Http;
using System.Threading.Tasks;

namespace MeowvBlog.API.Controllers
{
    [ApiController]
    [Route("[controller]")]
    [Produces("application/json")]
    [ApiExplorerSettings(GroupName = GlobalConsts.GroupName_v3)]
    public class MTAController : ControllerBase
    {
        private readonly IHttpClientFactory _httpClient;

        public MTAController(IHttpClientFactory httpClient)
        {
            _httpClient = httpClient;
        }

        #region 应用趋势

        /// <summary>
        /// 应用历史趋势
        /// 每天的pv\uv\vv\iv数据
        /// </summary>
        /// <param name="start_date">开始时间（Y-m-d）</param>
        /// <param name="end_date">结束时间（Y-m-d）</param>
        /// <param name="idx">查询指标(pv,uv,vv,iv)，使用“,”间隔</param>
        /// <returns></returns>
        [HttpGet]
        [Route("ctr_core_data")]
        public async Task<dynamic> Ctr_core_data(string start_date, string end_date, string idx)
        {
            var keyValues = new Dictionary<string, string>
            {
                { "start_date", start_date },
                { "end_date", end_date },
                { "idx", idx }
            };

            return await GetMTADataAsync(keyValues, MtaConfig.Ctr_core_data);
        }

        /// <summary>
        /// 应用实时小时数据
        /// 当天每小时的pv\uv\vv\iv数据
        /// </summary>
        /// <param name="idx">查询指标(pv,uv,vv,iv)，使用“,”间隔</param>
        /// <returns></returns>
        [HttpGet]
        [Route("ctr_realtime")]
        public async Task<dynamic> Ctr_realtime(string idx)
        {
            var keyValues = new Dictionary<string, string>
            {
                { "idx", idx }
            };

            return await GetMTADataAsync(keyValues, MtaConfig.Ctr_core_data);
        }

        /// <summary>
        /// 应用心跳数据
        /// 当前pv\uv\vv\iv心跳数据数据
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("ctr_realtime_heartbeat")]
        public async Task<dynamic> Ctr_realtime_heartbeat()
        {
            var keyValues = new Dictionary<string, string>();

            return await GetMTADataAsync(keyValues, MtaConfig.Ctr_core_data);
        }

        #endregion

        #region 访客分析

        /// <summary>
        /// 实时访客
        /// 在24小时内的实时访客信息
        /// </summary>
        /// <param name="page">页码，每页200条记录</param>
        /// <returns></returns>
        [HttpGet]
        [Route("ctr_user_realtime")]
        public async Task<dynamic> Ctr_user_realtime(int page)
        {
            var keyValues = new Dictionary<string, string>
            {
                { "page", page.ToString() }
            };

            return await GetMTADataAsync(keyValues, MtaConfig.Ctr_core_data);
        }

        /// <summary>
        /// 新老访客比
        /// 按天查询当天新访客与旧访客的数量
        /// </summary>
        /// <param name="start_date">开始时间（Y-m-d）</param>
        /// <param name="end_date">结束时间（Y-m-d）</param>
        /// <returns></returns>
        [HttpGet]
        [Route("ctr_user_compare")]
        public async Task<dynamic> Ctr_user_compare(string start_date, string end_date)
        {
            var keyValues = new Dictionary<string, string>
            {
                { "start_date", start_date },
                { "end_date", end_date }
            };

            return await GetMTADataAsync(keyValues, MtaConfig.Ctr_core_data);
        }

        /// <summary>
        /// 用户画像
        /// 查询用户画像数据，包含性别比例、年龄分布、学历分布、职业分布，数据为pv量
        /// </summary>
        /// <param name="start_date">开始时间（Y-m-d）</param>
        /// <param name="end_date">结束时间（Y-m-d）</param>
        /// <param name="idx">查询指标(sex-性别,age-年龄,grade-学历,profession-职业)，使用“,”间隔</param>
        /// <returns></returns>
        [HttpGet]
        [Route("ctr_user_portrait")]
        public async Task<dynamic> Ctr_user_portrait(string start_date, string end_date, string idx)
        {
            var keyValues = new Dictionary<string, string>
            {
                { "start_date", start_date },
                { "end_date", end_date },
                { "idx", idx }
            };

            return await GetMTADataAsync(keyValues, MtaConfig.Ctr_core_data);
        }

        #endregion

        #region 客户端分析

        /// <summary>
        /// 地区数据
        /// 按天查询地区的pv\uv\vv\iv量
        /// </summary>
        /// <param name="type_ids">城市id，见https://mta.qq.com/docs/h5_api.html(省市字典，市字典)使用“,”间隔</param>
        /// <param name="start_date">开始时间（Y-m-d）</param>
        /// <param name="end_date">结束时间（Y-m-d）</param>
        /// <param name="idx">查询指标(pv,uv,vv,iv)，使用“,”间隔</param>
        /// <returns></returns>
        [HttpGet]
        [Route("ctr_area")]
        public async Task<dynamic> Ctr_area(string type_ids, string start_date, string end_date, string idx)
        {
            var keyValues = new Dictionary<string, string>
            {
                { "type_ids", type_ids },
                { "start_date", start_date },
                { "end_date", end_date },
                { "idx", idx }
            };

            return await GetMTADataAsync(keyValues, MtaConfig.Ctr_core_data);
        }

        /// <summary>
        /// 省市数据
        /// 按天查询省市下有流量的城市的pv\uv\vv\iv量
        /// </summary>
        /// <param name="type_ids">省市id，可选值见https://mta.qq.com/docs/h5_api.html(省市字典中的省ID)使用“,”间隔</param>
        /// <param name="start_date">开始时间（Y-m-d）</param>
        /// <param name="end_date">结束时间（Y-m-d）</param>
        /// <param name="idx">查询指标(pv,uv,vv,iv)，使用“,”间隔</param>
        /// <returns></returns>
        [HttpGet]
        [Route("ctr_area_province")]
        public async Task<dynamic> Ctr_area_province(string type_ids, string start_date, string end_date, string idx)
        {
            var keyValues = new Dictionary<string, string>
            {
                { "type_ids", type_ids },
                { "start_date", start_date },
                { "end_date", end_date },
                { "idx", idx }
            };

            return await GetMTADataAsync(keyValues, MtaConfig.Ctr_core_data);
        }

        /// <summary>
        /// 运营商
        /// 按天查询运营商的pv\uv\vv\iv量
        /// </summary>
        /// <param name="type_ids">运营商ID，可选值见https://mta.qq.com/docs/h5_api.html(运营商)使用“,”间隔</param>
        /// <param name="start_date">开始时间（Y-m-d）</param>
        /// <param name="end_date">结束时间（Y-m-d）</param>
        /// <param name="idx">查询指标(pv,uv,vv,iv)，使用“,”间隔</param>
        /// <returns></returns>
        [HttpGet]
        [Route("ctr_operator")]
        public async Task<dynamic> Ctr_operator(string type_ids, string start_date, string end_date, string idx)
        {
            var keyValues = new Dictionary<string, string>
            {
                { "type_ids", type_ids },
                { "start_date", start_date },
                { "end_date", end_date },
                { "idx", idx }
            };

            return await GetMTADataAsync(keyValues, MtaConfig.Ctr_core_data);
        }

        /// <summary>
        /// 终端属性列表
        /// 按天查询对应属性的终端信息数据
        /// </summary>
        /// <param name="start_date">开始时间（Y-m-d）</param>
        /// <param name="end_date">结束时间（Y-m-d）</param>
        /// <param name="type_id">终端属性，可选值见https://mta.qq.com/docs/h5_api.html(终端属性)</param>
        /// <param name="idx">查询指标(pv,uv,vv,iv)，使用“,”间隔</param>
        /// <returns></returns>
        [HttpGet]
        [Route("ctr_client_para")]
        public async Task<dynamic> Ctr_client_para(string start_date, string end_date, string type_id, string idx)
        {
            var keyValues = new Dictionary<string, string>
            {
                { "start_date", start_date },
                { "end_date", end_date },
                { "type_id", type_id },
                { "idx", idx }
            };

            return await GetMTADataAsync(keyValues, MtaConfig.Ctr_core_data);
        }

        /// <summary>
        /// 终端信息
        /// 按天查询终端信息数据
        /// </summary>
        /// <param name="start_date">开始时间（Y-m-d）</param>
        /// <param name="end_date">结束时间（Y-m-d）</param>
        /// <param name="type_id">终端属性，可选值见https://mta.qq.com/docs/h5_api.html(终端属性)</param>
        /// <param name="type_contents">终端名称，可选值为终端属性列表返回的client值，使用“,”间隔查询</param>
        /// <param name="idx">查询指标(pv,uv,vv,iv)，使用“,”间隔</param>
        /// <returns></returns>
        [HttpGet]
        [Route("ctr_client_content")]
        public async Task<dynamic> Ctr_client_content(string start_date, string end_date, string type_id, string type_contents, string idx)
        {
            var keyValues = new Dictionary<string, string>
            {
                { "start_date", start_date },
                { "end_date", end_date },
                { "type_id", type_id },
                { "type_contents", type_contents },
                { "idx", idx }
            };

            return await GetMTADataAsync(keyValues, MtaConfig.Ctr_core_data);
        }

        #endregion

        #region 页面分析

        /// <summary>
        /// 页面排行-当天实时列表
        /// 查询当天所有url的pv\uv\vv\iv数据
        /// </summary>
        /// <param name="idx">查询指标(pv,uv,vv,iv)，使用“,”间隔</param>
        /// <returns></returns>
        [HttpGet]
        [Route("ctr_page_realtime")]
        public async Task<dynamic> Ctr_page_realtime(string idx)
        {
            var keyValues = new Dictionary<string, string>
            {
                { "idx", idx }
            };

            return await GetMTADataAsync(keyValues, MtaConfig.Ctr_core_data);
        }

        /// <summary>
        /// 页面排行-离线列表
        /// 按天查询所有url的pv\uv\vv\iv数据
        /// </summary>
        /// <param name="start_date">开始时间（Y-m-d）</param>
        /// <param name="end_date">结束时间（Y-m-d）</param>
        /// <param name="page">页码，每页2000条</param>
        /// <param name="idx">查询指标(pv,uv,vv,iv)，使用“,”间隔</param>
        /// <returns></returns>
        [HttpGet]
        [Route("ctr_page_offline")]
        public async Task<dynamic> Ctr_page_offline(string start_date, string end_date, int page, string idx)
        {
            var keyValues = new Dictionary<string, string>
            {
                { "start_date", start_date },
                { "end_date", end_date },
                { "page", page.ToString() },
                { "idx", idx }
            };

            return await GetMTADataAsync(keyValues, MtaConfig.Ctr_core_data);
        }

        /// <summary>
        /// 页面排行-指定查询部分url
        /// 按天查询url的pv\uv\vv\iv数据。
        /// </summary>
        /// <param name="start_date">开始时间（Y-m-d）</param>
        /// <param name="end_date">结束时间（Y-m-d）</param>
        /// <param name="urls">url地址，多个使用逗号“,”间隔</param>
        /// <param name="idx">查询指标(pv,uv,vv,iv)，使用“,”间隔</param>
        /// <returns></returns>
        [HttpGet]
        [Route("ctr_page_url")]
        public async Task<dynamic> Ctr_page_url(string start_date, string end_date, string urls, string idx)
        {
            var keyValues = new Dictionary<string, string>
            {
                { "start_date", start_date },
                { "end_date", end_date },
                { "urls", urls },
                { "idx", idx }
            };

            return await GetMTADataAsync(keyValues, MtaConfig.Ctr_core_data);
        }

        /// <summary>
        /// 性能监控
        /// 按天查询对应省市的访问延时与解析时长
        /// </summary>
        /// <param name="start_date">开始时间（Y-m-d）</param>
        /// <param name="end_date">结束时间（Y-m-d）</param>
        /// <param name="type_contents">省市id/运营商id/页面地址，可选值见https://mta.qq.com/docs/h5_api.html(省市/运营商)</param>
        /// <param name="type">类别，可选值见https://mta.qq.com/docs/h5_api.html(性能监控)</param>
        /// <param name="idx">查询指标(visitor_speed-访问延时,dns_speed-DNS解析时长,tcp_speed-TCP链接时长,request_speed-首字节时长,resource_speed-资源下载时长,dom_speed-页面渲染时长)，使用“,”间隔</param>
        /// <returns></returns>
        [HttpGet]
        [Route("ctr_page_speed")]
        public async Task<dynamic> Ctr_page_speed(string start_date, string end_date, string type_contents, string type, string idx)
        {
            var keyValues = new Dictionary<string, string>
            {
                { "start_date", start_date },
                { "end_date", end_date },
                { "type_contents", type_contents },
                { "type", type },
                { "idx", idx }
            };

            return await GetMTADataAsync(keyValues, MtaConfig.Ctr_core_data);
        }

        /// <summary>
        /// 访问深度
        /// 按天查询用户访问深度
        /// </summary>
        /// <param name="start_date">开始时间（Y-m-d）</param>
        /// <param name="end_date">结束时间（Y-m-d）</param>
        /// <returns></returns>
        [HttpGet]
        [Route("ctr_page_depth")]
        public async Task<dynamic> Ctr_page_depth(string start_date, string end_date)
        {
            var keyValues = new Dictionary<string, string>
            {
                { "start_date", start_date },
                { "end_date", end_date }
            };

            return await GetMTADataAsync(keyValues, MtaConfig.Ctr_core_data);
        }

        #endregion

        #region 来源分析

        /// <summary>
        /// 外部链接
        /// 按天查询外部同站链接带来的流量情情况
        /// </summary>
        /// <param name="urls">url地址，多个使用逗号“,”间隔</param>
        /// <param name="start_date">开始时间（Y-m-d）</param>
        /// <param name="end_date">结束时间（Y-m-d）</param>
        /// <param name="idx">查询指标(pv,uv,vv,iv)，使用“,”间隔</param>
        /// <returns></returns>
        [HttpGet]
        [Route("ctr_source_out")]
        public async Task<dynamic> Ctr_source_out(string urls, string start_date, string end_date, string idx)
        {
            var keyValues = new Dictionary<string, string>
            {
                { "urls", urls },
                { "start_date", start_date },
                { "end_date", end_date },
                { "idx", idx }
            };

            return await GetMTADataAsync(keyValues, MtaConfig.Ctr_core_data);
        }

        /// <summary>
        /// 入口页面
        /// 按天查询用户最后访问的进入次数与跳出率
        /// </summary>
        /// <param name="urls">url地址，多个使用逗号“,”间隔</param>
        /// <param name="start_date">开始时间（Y-m-d）</param>
        /// <param name="end_date">结束时间（Y-m-d）</param>
        /// <returns></returns>
        [HttpGet]
        [Route("ctr_page_land")]
        public async Task<dynamic> Ctr_page_land(string urls, string start_date, string end_date)
        {
            var keyValues = new Dictionary<string, string>
            {
                { "start_date", start_date },
                { "end_date", end_date }
            };

            return await GetMTADataAsync(keyValues, MtaConfig.Ctr_core_data);
        }

        /// <summary>
        /// 离开页面
        /// 按天查询最后访问页面的离次数
        /// </summary>
        /// <param name="urls">url地址，多个使用逗号“,”间隔</param>
        /// <param name="start_date">开始时间（Y-m-d）</param>
        /// <param name="end_date">结束时间（Y-m-d）</param>
        /// <returns></returns>
        [HttpGet]
        [Route("ctr_page_exit")]
        public async Task<dynamic> Ctr_page_exit(string urls, string start_date, string end_date)
        {
            var keyValues = new Dictionary<string, string>
            {
                { "urls", urls },
                { "start_date", start_date },
                { "end_date", end_date }
            };

            return await GetMTADataAsync(keyValues, MtaConfig.Ctr_core_data);
        }

        #endregion

        #region 自定义事件

        /// <summary>
        /// 自定义事件
        /// 按天查询自定义事件的pv\uv\vv\iv
        /// </summary>
        /// <param name="custom">自定义事件id，多个自定义事件ID需使用逗号“,”间隔</param>
        /// <param name="start_date">开始时间（Y-m-d）</param>
        /// <param name="end_date">结束时间（Y-m-d）</param>
        /// <param name="idx">查询指标(pv,uv,vv,iv)，使用“,”间隔</param>
        /// <returns></returns>
        [HttpGet]
        [Route("ctr_custom")]
        public async Task<dynamic> Ctr_custom(string custom, string start_date, string end_date, string idx)
        {
            var keyValues = new Dictionary<string, string>
            {
                { "custom", custom },
                { "start_date", start_date },
                { "end_date", end_date },
                { "idx", idx }
            };

            return await GetMTADataAsync(keyValues, MtaConfig.Ctr_core_data);
        }

        #endregion

        #region 渠道效果统计

        /// <summary>
        /// 渠道效果统计
        /// 按天查询渠道的分析数据
        /// </summary>
        /// <param name="start_date">开始时间（Y-m-d）</param>
        /// <param name="end_date">结束时间（Y-m-d）</param>
        /// <param name="adtags">渠道id，多个使用“,”间隔</param>
        /// <param name="idx">查询指标(pv,uv,vv,iv)，使用“,”间隔</param>
        /// <returns></returns>
        [HttpGet]
        [Route("ctr_adtag")]
        public async Task<dynamic> Ctr_adtag(string start_date, string end_date, string adtags, string idx)
        {
            var keyValues = new Dictionary<string, string>
            {
                { "start_date", start_date },
                { "end_date", end_date },
                { "adtags", adtags },
                { "idx", idx }
            };

            return await GetMTADataAsync(keyValues, MtaConfig.Ctr_core_data);
        }

        #endregion

        #region 获取MTA接口返回数据

        /// <summary>
        /// 获取 MTA 接口返回数据
        /// </summary>
        /// <param name="keyValues"></param>
        /// <param name="api"></param>
        /// <returns></returns>
        private async Task<dynamic> GetMTADataAsync(Dictionary<string, string> keyValues, string api)
        {
            var url = $"{api}{keyValues.GgenerateMTAQuery()}";

            using var client = _httpClient.CreateClient();
            var result = await client.GetStringAsync(url);

            return result.DeserializeFromJson<dynamic>();
        }

        #endregion
    }
}