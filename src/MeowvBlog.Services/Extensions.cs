using System.IO;
using System.IO.Compression;
using System.Net;
using System.Text;

namespace MeowvBlog.Services
{
    public static class Extensions
    {
        /// <summary>
        /// HttpWebRequest请求对象
        /// </summary>
        /// <param name="url">请求地址</param>
        /// <param name="type">请求类型，默认GET</param>
        /// <param name="data">POST数据</param>
        /// <param name="charset">编码，默认utf-8</param>
        /// <returns></returns>
        public static HttpWebRequest HWRequest(this string url, string type = "GET", string data = null, string charset = "utf-8")
        {
            HttpWebRequest httpWebRequest = (HttpWebRequest)WebRequest.Create(url);
            httpWebRequest.Method = type;
            httpWebRequest.KeepAlive = true;
            httpWebRequest.AllowAutoRedirect = true;
            httpWebRequest.MaximumAutomaticRedirections = 4;
            httpWebRequest.Timeout = 95307;
            httpWebRequest.ContentType = "application/x-www-form-urlencoded";
            if (type != "GET" && data != null)
            {
                byte[] bytes = Encoding.GetEncoding(charset).GetBytes(data);
                httpWebRequest.ContentLength = Encoding.GetEncoding(charset).GetBytes(data).Length;
                Stream requestStream = httpWebRequest.GetRequestStream();
                requestStream.Write(bytes, 0, bytes.Length);
                requestStream.Close();
            }
            return httpWebRequest;
        }

        /// <summary>
        /// HttpWebRequest请求结果
        /// </summary>
        /// <param name="request"></param>
        /// <param name="charset"></param>
        /// <returns></returns>
        public static string HWRequestResult(this HttpWebRequest request, string charset = "utf-8")
        {
            HttpWebResponse httpWebResponse = (HttpWebResponse)request.GetResponse();
            Stream stream = httpWebResponse.GetResponseStream();
            if (string.Compare(httpWebResponse.ContentEncoding, "gzip", ignoreCase: true) >= 0)
            {
                stream = new GZipStream(stream, CompressionMode.Decompress);
            }
            using (StreamReader streamReader = new StreamReader(stream, Encoding.GetEncoding(charset)))
            {
                return streamReader.ReadToEnd();
            }
        }

        /// <summary>
        /// GET请求
        /// </summary>
        /// <param name="url">地址</param>
        /// <param name="charset">编码，默认utf-8</param>
        /// <returns></returns>
        public static string HttpGet(this string url, string charset = "utf-8")
        {
            HttpWebRequest request = HWRequest(url, "GET", null, charset);
            return HWRequestResult(request, charset);
        }

        /// <summary>
        /// POST请求
        /// </summary>
        /// <param name="url">地址</param>
        /// <param name="data">POST数据</param>
        /// <param name="charset">编码，默认utf-8</param>
        /// <returns></returns>
        public static string HttpPost(this string url, string data, string charset = "utf-8")
        {
            HttpWebRequest request = HWRequest(url, "POST", data, charset);
            return HWRequestResult(request, charset);
        }
    }
}