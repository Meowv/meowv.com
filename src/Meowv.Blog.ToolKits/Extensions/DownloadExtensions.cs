using System.IO;
using System.Threading.Tasks;

namespace Meowv.Blog.ToolKits.Extensions
{
    public static class DownloadExtensions
    {
        /// <summary>
        /// 将数组类型文件保存至指定路径
        /// </summary>
        /// <param name="buffer"></param>
        /// <param name="path"></param>
        /// <returns></returns>
        public static async Task DownloadAsync(this byte[] buffer, string path)
        {
            using var ms = new MemoryStream(buffer);
            using var stream = new FileStream(path, FileMode.Create);

            var bytes = new byte[1024];
            var size = await ms.ReadAsync(bytes, 0, bytes.Length);
            while (size > 0)
            {
                await stream.WriteAsync(bytes, 0, size);
                size = await ms.ReadAsync(bytes, 0, bytes.Length);
            }
        }
    }
}