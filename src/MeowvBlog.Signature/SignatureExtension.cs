using MeowvBlog.Core.Configuration;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats;
using SixLabors.ImageSharp.Processing;
using SixLabors.Primitives;
using System;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace MeowvBlog.Signature
{
    public static class SignatureExtension
    {
        private static string GetSignaturePath(string name, int id)
        {
            return Path.Combine(AppSettings.SignaturePath, $"{Convert.ToBase64String(Encoding.UTF8.GetBytes(name + id)).Replace("/", "")}.png");
        }

        /// <summary>
        /// 将远程图片保存至本地
        /// </summary>
        /// <param name="signaturePath"></param>
        /// <param name="imgUrl"></param>
        private static void DownloadImg(this string signaturePath, string imgUrl)
        {
            using (var http = new HttpClient())
            {
                var buffer = http.GetByteArrayAsync(imgUrl);
                using (var ms = new MemoryStream(buffer.Result))
                using (var stream = new FileStream(signaturePath, FileMode.Create))
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
        }

        /// <summary>
        /// 添加二维码
        /// </summary>
        /// <param name="signaturePath"></param>
        /// <returns></returns>
        private static async Task AddQrcodeAsync(this string signaturePath)
        {
            var qrcodePath = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot/images/qrcode.png");
            var qecodeBytes = await File.ReadAllBytesAsync(qrcodePath);

            var signImgBytes = await File.ReadAllBytesAsync(signaturePath);

            var signImg = Image.Load(signImgBytes, out IImageFormat format);
            var qrcodeImg = Image.Load(qecodeBytes);

            qrcodeImg.Mutate(x =>
            {
                x.DrawImage(signImg, 0.9f);
            });

            var signImgBase64 = qrcodeImg.ToBase64String(format);
            var reg = new Regex("data:image/(.*);base64,");
            signImgBase64 = reg.Replace(signImgBase64, "");

            var bytes = Convert.FromBase64String(signImgBase64);

            SaveImg(bytes, signaturePath);
        }

        /// <summary>
        /// 将byte类型签名图片保存至本地
        /// </summary>
        /// <param name="buffer"></param>
        /// <param name="path"></param>
        private static void SaveImg(byte[] buffer, string path)
        {
            using (var ms = new MemoryStream(buffer))
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

        /// <summary>
        /// 获取签名图片地址
        /// </summary>
        /// <param name="name"></param>
        /// <param name="id"></param>
        /// <returns></returns>
        public static async Task<string> GenerateSignature(this string name, int id)
        {
            var url = SignatureConfig.SignatureUrl(name, id);

            var hwr = url.Name.HWRequest(type: "POST", data: url.Value);
            hwr.ContentType = "application/x-www-form-urlencoded";
            hwr.UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/75.0.3770.142 Safari/537.36";

            var result = hwr.HWRequestResult();

            var regex = new Regex(@"<img\b[^<>]*?\bsrc[\s\t\r\n]*=[\s\t\r\n]*[""']?[\s\t\r\n]*(?<imgUrl>[^\s\t\r\n""'<>]*)[^<>]*?/?[\s\t\r\n]*>", RegexOptions.IgnoreCase);

            var signatureUrl = regex.Match(result).Groups["imgUrl"].Value;

            var signaturePath = GetSignaturePath(name, id);

            signaturePath.DownloadImg(signatureUrl);
            await signaturePath.AddQrcodeAsync();

            return $"{Convert.ToBase64String(Encoding.UTF8.GetBytes(name + id)).Replace("/", "")}.png";
        }
    }
}