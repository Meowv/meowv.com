using System.IO;
using System.Net.Http;

namespace Meowv.Utilities
{
    public class FileHelper
    {
        /// <summary>
        /// 下载文件工具类
        /// </summary>
        /// <param name="url">地址</param>
        /// <param name="path">路径</param>
        public static bool DownLoad(string url, string path)
        {
            try
            {
                using (var http = new HttpClient())
                {
                    var buffer = http.GetByteArrayAsync(url);
                    using (var ms = new MemoryStream(buffer.Result))
                    {
                        using (var stream = new FileStream(path, FileMode.Create))
                        {
                            var bytes = new byte[1024];
                            var size = ms.Read(bytes, 0, bytes.Length);
                            while (size > 0)
                            {
                                stream.Write(bytes, 0, size);
                                size = ms.Read(bytes, 0, bytes.Length);
                            }
                        }
                    }
                    return true;
                }
            }
            catch
            {
                return false;
            }
        }

        /// <summary>
        /// 将byte数组保存为文件
        /// </summary>
        /// <param name="buffer"></param>
        /// <param name="path"></param>
        /// <returns></returns>
        public static bool SaveFile(byte[] buffer, string path)
        {
            try
            {
                using (var ms = new MemoryStream(buffer))
                {
                    using (var stream = new FileStream(path, FileMode.Create))
                    {
                        var bytes = new byte[1024];
                        var size = ms.Read(bytes, 0, bytes.Length);
                        while (size > 0)
                        {
                            stream.Write(bytes, 0, size);
                            size = ms.Read(bytes, 0, bytes.Length);
                        }
                    }
                }
                return true;
            }
            catch
            {
                return false;
            }
        }
    }
}