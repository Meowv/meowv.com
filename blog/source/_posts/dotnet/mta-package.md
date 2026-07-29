---
title: 使用MTA HTML5统计API来分析数据
author: 阿星𝑷𝒍𝒖𝒔
date: 2019-08-23 10:47:23
categories: .NET
tags:
  - .NET Core
  - 数据分析
---

在开发个人博客的时候，用到了腾讯移动分析(MTA)，相比其他数据统计平台来说我喜欢她的简洁高效，易上手，同时文档也比较全面，提供了数据接口供用户调用。

在看了 MTA 演示[Demo](https://mta.qq.com/mta/manage/ctr_demo)和[官方文档](https://mta.qq.com/docs/)后，我就决定使用 .NET Core 将其 HTML5 统计 API 进行封装，以供博客直接调用，省去各种鉴权生成 sign 的操作。

首先需要在[MTA](https://mta.qq.com/)官网进行 HTML5 应用创建，当然她还支持小程序和移动 App。

![ ](/images/dotnet/mta-package-01.png)

然后就可以看到如上图的应用管理界面，如果你不打算使用其 API 接口，直接拿到统计代码嵌入在自己网站中即可，不出意外 10 分钟左右即可查看网站部分指标的实时数据，次日可以查看昨日的全部数据。

接下来继续，在调用 MTA 接口之前需要先生成 sign，

> 双方维护同一份私钥，在发起请求的时候，发起方(合作方)将当前的请求参数数组，按照 key 值进行排序，然后'key=value'拼接到加密串后，进行 md5 的编码。接收方以同样的处理方式，对 ts 小于或等于 30 分钟的请求进行处理，sign 一致则合法，否则失败。

有了这段算法描述，利用 C#代码实现如下：

```csharp
/// <summary>
/// 生成sign
/// </summary>
/// <param name="keyValues"></param>
/// <returns></returns>
public static string GgenerateSign(this Dictionary<string, string> keyValues)
{
    keyValues.Add("app_id", MtaConfig.App_Id);
    IDictionary<string, string> sortedParams = new SortedDictionary<string, string>(keyValues);
    var iterator = sortedParams.GetEnumerator();
    var sb = new StringBuilder();
    while (iterator.MoveNext())
    {
        var key = iterator.Current.Key;
        var value = iterator.Current.Value;
        if (key.IsNotNullOrEmpty() && value.IsNotNullOrEmpty())
        {
            sb.Append(key).Append("=").Append(value);
        }
    }
    return (MtaConfig.SECRET_KEY + sb.ToString()).Md5();
}
```

将参数放入一个字典，并按照 key 值进行排序。因为所有接口都需要参数`app_id`，所以将其默认添加进去，不在额外当做参数。

`.Md5()`是一个扩展方法，将字符窜按照 MD5 方式加密

拿到 sign 后就可以调用接口了，因为是封装，那么将所有接口都保存为静态变量，代码如下

```csharp
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
```

接下来对照文档生成 URL 的查询参数，然后访问接口拿到返回数据

```csharp
/// <summary>
/// 生成URL查询参数
/// </summary>
/// <param name="keyValues"></param>
/// <returns></returns>
public static string GgenerateQuery(this Dictionary<string, string> keyValues)
{
    var sign = keyValues.GgenerateSign();

    var query = "?";

    keyValues.ForEach(x =>
    {
        query += $"{x.Key}={x.Value}&";
    });

    return $"{query}sign={sign}";
}
```

```csharp
/// <summary>
/// 获取MTA接口返回数据
/// </summary>
/// <param name="keyValues"></param>
/// <returns></returns>
public static async Task<string> GetMTAData(this Dictionary<string, string> keyValues, string api)
{
    var url = $"{api}{keyValues.GgenerateQuery()}";

    // HWRequest()和HWRequestResult()是扩展方法，可以选择自己熟悉HTTP请求方法
    var hwr = url.HWRequest();
    string result = hwr.HWRequestResult();

    return await Task.FromResult(result);
}
```

到这里基本上就结束了，只需对照 MTA 文档传入对应的参数即可拿到返回的数据了。

以其中一个接口为例，应用历史趋势，获取每天的 pv、uv、vv、iv 数据

```csharp
/// <summary>
/// 应用历史趋势
/// 每天的pv\uv\vv\iv数据
/// </summary>
/// <param name="start_date">开始时间（Y-m-d）</param>
/// <param name="end_date">结束时间（Y-m-d）</param>
/// <param name="idx">查询指标(pv,uv,vv,iv)，使用“,”间隔</param>
/// <returns></returns>
public async Task<string> Ctr_core_data(string start_date, string end_date, string idx)
{
    var keyValues = new Dictionary<string, string>
    {
        { "start_date", start_date },
        { "end_date", end_date },
        { "idx", idx }
    };
    return await keyValues.GetMTAData(MtaConfig.Ctr_core_data);
}
```

在 controller 中进行调用

```csharp
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
    var result = await _mtaService.Ctr_core_data(start_date, end_date, idx);

    return result.DeserializeFromJson<dynamic>();
}
```

查询结果看下图

![ ](/images/dotnet/mta-package-02.png)
