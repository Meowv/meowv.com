namespace Meowv.Blog.Domain.Configurations
{
    public class MtaConfig
    {
        #region 应用趋势

        /// <summary>
        /// 应用历史趋势
        /// 每天的pv\uv\vv\iv数据
        /// </summary>
        public static string Ctr_core_data = "https://mta.qq.com/h5/api/ctr_core_data";

        /// <summary>
        /// 应用实时小时数据
        /// 当天每小时的pv\uv\vv\iv数据
        /// </summary>
        public static string Ctr_realtime = "https://mta.qq.com/h5/api/ctr_realtime/get_by_hour";

        /// <summary>
        /// 应用心跳数据
        /// 当前pv\uv\vv\iv心跳数据数据
        /// </summary>
        public static string Ctr_realtime_heartbeat = "https://mta.qq.com/h5/api/ctr_realtime/heartbeat";

        #endregion

        #region 访客分析

        /// <summary>
        /// 实时访客
        /// 在24小时内的实时访客信息
        /// </summary>
        public static string Ctr_user_realtime = "https://mta.qq.com/h5/api/ctr_user_realtime";

        /// <summary>
        /// 新老访客比
        /// 按天查询当天新访客与旧访客的数量
        /// </summary>
        public static string Ctr_user_compare = "https://mta.qq.com/h5/api/ctr_user_compare";

        /// <summary>
        /// 用户画像
        /// 查询用户画像数据，包含性别比例、年龄分布、学历分布、职业分布，数据为pv量
        /// </summary>
        public static string Ctr_user_portrait = "https://mta.qq.com/h5/api/ctr_user_portrait";

        #endregion

        #region 客户端分析

        /// <summary>
        /// 地区数据
        /// 按天查询地区的pv\uv\vv\iv量
        /// </summary>
        public static string Ctr_area = "https://mta.qq.com/h5/api/ctr_area/get_by_area";

        /// <summary>
        /// 省市数据
        /// 按天查询省市下有流量的城市的pv\uv\vv\iv量
        /// </summary>
        public static string Ctr_area_province = "https://mta.qq.com/h5/api/ctr_area/get_by_province";

        /// <summary>
        /// 运营商
        /// 按天查询运营商的pv\uv\vv\iv量
        /// </summary>
        public static string Ctr_operator = "https://mta.qq.com/h5/api/ctr_operator";

        /// <summary>
        /// 终端属性列表
        /// 按天查询对应属性的终端信息数据
        /// </summary>
        public static string Ctr_client_para = "https://mta.qq.com/h5/api/ctr_client/get_by_para";

        /// <summary>
        /// 终端信息
        /// 按天查询终端信息数据
        /// </summary>
        public static string Ctr_client_content = "https://mta.qq.com/h5/api/ctr_client/get_by_content";

        #endregion

        #region 页面分析

        /// <summary>
        /// 页面排行-当天实时列表
        /// 查询当天所有url的pv\uv\vv\iv数据
        /// </summary>
        public static string Ctr_page_realtime = "https://mta.qq.com/h5/api/ctr_page/list_all_page_realtime";

        /// <summary>
        /// 页面排行-离线列表
        /// 按天查询所有url的pv\uv\vv\iv数据
        /// </summary>
        public static string Ctr_page_offline = "https://mta.qq.com/h5/api/ctr_page/list_all_page_offline";

        /// <summary>
        /// 页面排行-指定查询部分url
        /// 按天查询url的pv\uv\vv\iv数据。
        /// </summary>
        public static string Ctr_page_url = "https://mta.qq.com/h5/api/ctr_page";

        /// <summary>
        /// 性能监控
        /// 按天查询对应省市的访问延时与解析时长
        /// </summary>
        public static string Ctr_page_speed = "https://mta.qq.com/h5/api/ctr_page_speed";

        /// <summary>
        /// 访问深度
        /// 按天查询用户访问深度
        /// </summary>
        public static string Ctr_page_depth = "https://mta.qq.com/h5/api/ctr_depth";

        #endregion

        #region 来源分析

        /// <summary>
        /// 外部链接
        /// 按天查询外部同站链接带来的流量情情况
        /// </summary>
        public static string Ctr_source_out = "https://mta.qq.com/h5/api/ctr_source_out";

        /// <summary>
        /// 入口页面
        /// 按天查询用户最后访问的进入次数与跳出率
        /// </summary>
        public static string Ctr_page_land = "https://mta.qq.com/h5/api/ctr_page_land";

        /// <summary>
        /// 离开页面
        /// 按天查询最后访问页面的离次数
        /// </summary>
        public static string Ctr_page_exit = "https://mta.qq.com/h5/api/ctr_page_exit";

        #endregion

        #region 自定义事件

        /// <summary>
        /// 自定义事件
        /// 按天查询自定义事件的pv\uv\vv\iv
        /// </summary>
        public static string Ctr_custom = "https://mta.qq.com/h5/api/ctr_custom";

        #endregion

        #region 渠道效果统计

        /// <summary>
        /// 渠道效果统计
        /// 按天查询渠道的分析数据
        /// </summary>
        public static string Ctr_adtag = "https://mta.qq.com/h5/api/ctr_adtag";

        #endregion

        #region MTA CONFIG

        /// <summary>
        /// App_Id
        /// </summary>
        public static string App_Id = AppSettings.MTA.App_Id;

        /// <summary>
        /// SECRET_KEY
        /// </summary>
        public static string SECRET_KEY = AppSettings.MTA.SECRET_KEY;

        #endregion
    }
}