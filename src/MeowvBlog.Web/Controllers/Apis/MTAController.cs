using Microsoft.AspNetCore.Mvc;

namespace MeowvBlog.Web.Controllers.Apis
{
    [Route("api/[controller]")]
    [ApiController]
    public class MTAController : ControllerBase
    {
        [HttpGet]
        [Route("sign")]
        public string GetSign()
        {
            //IDictionary<string, string> keys = new Dictionary<string, string>
            //{
            //    { "app_id", "500692160" },
            //    { "start_date", "2019-8-1" },
            //    { "end_date", "2019-8-1" },
            //    { "idx", "pv,uv,vv,iv" }
            //};

            //IDictionary<string, string> sortedParams = new SortedDictionary<string, string>(keys);
            //IEnumerator<KeyValuePair<string, string>> iterator = sortedParams.GetEnumerator();

            //StringBuilder basestring = new StringBuilder();
            //while (iterator.MoveNext())
            //{
            //    string key = iterator.Current.Key;
            //    string value = iterator.Current.Value;
            //    if (!string.IsNullOrEmpty(key) && !string.IsNullOrEmpty(value))
            //    {
            //        basestring.Append(key).Append("=").Append(value);
            //    }
            //}
            //var result = "cfb67fce365034d2d56e35744fdca4c0" + basestring.ToString();

            //return result.Md5();

            return "";
        }
    }
}