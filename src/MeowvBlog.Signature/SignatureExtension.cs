using MeowvBlog.Core.Configuration;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats;
using SixLabors.ImageSharp.Processing;
using System;
using System.IO;
using System.Net.Http;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace MeowvBlog.Signature
{
    public static class SignatureExtension
    {
        private static readonly HttpClient _client = new HttpClient();

        private static string GetSignaturePath(string name, int id)
        {
            return Path.Combine(AppSettings.Signature.Path, $"{(name + id).Md5()}.png");
        }

        /// <summary>
        /// 将远程图片保存至本地
        /// </summary>
        /// <param name="signaturePath"></param>
        /// <param name="imgUrl"></param>
        private static void DownloadImg(this string signaturePath, string imgUrl)
        {
            var buffer = _client.GetByteArrayAsync(imgUrl);
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

        /// <summary>
        /// 添加二维码
        /// </summary>
        /// <param name="signaturePath"></param>
        /// <returns></returns>
        private static async Task AddQrcodeAsync(this string signaturePath)
        {
            var qrcodePath = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot/images/qrcode.png");
            await CombineSignature(signaturePath, qrcodePath);
        }

        /// <summary>
        /// 添加水印
        /// </summary>
        /// <param name="signaturePath"></param>
        /// <returns></returns>
        private static async Task AddWatermarkAsync(this string signaturePath)
        {
            var qrcodePath = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot/images/watermark.png");
            await CombineSignature(signaturePath, qrcodePath);
        }

        /// <summary>
        /// 合并签名图
        /// </summary>
        /// <param name="signaturePath"></param>
        /// <param name="qrcodePath"></param>
        /// <returns></returns>
        private static async Task CombineSignature(string signaturePath, string qrcodePath)
        {
            var qecodeBytes = await File.ReadAllBytesAsync(qrcodePath);

            var signImgBytes = await File.ReadAllBytesAsync(signaturePath);

            var signImg = Image.Load(signImgBytes, out IImageFormat format);
            var qrcodeImg = Image.Load(qecodeBytes);

            qrcodeImg.Mutate(x =>
            {
                x.DrawImage(signImg, 0.8f);
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
        /// <param name="from"></param>
        /// <returns></returns>
        public static async Task<string> GenerateSignature(this string name, int id, string from = "")
        {
            var signature = SignatureConfig.SignatureUrl(name, id);

            var hwr = signature.Url.HWRequest(type: "POST", data: signature.Parameter);
            hwr.ContentType = "application/x-www-form-urlencoded";
            hwr.UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/75.0.3770.142 Safari/537.36";

            var result = hwr.HWRequestResult();

            var regex = new Regex(@"<img\b[^<>]*?\bsrc[\s\t\r\n]*=[\s\t\r\n]*[""']?[\s\t\r\n]*(?<imgUrl>[^\s\t\r\n""'<>]*)[^<>]*?/?[\s\t\r\n]*>", RegexOptions.IgnoreCase);

            var signatureUrl = regex.Match(result).Groups["imgUrl"].Value;

            var signaturePath = GetSignaturePath(name, id);

            signaturePath.DownloadImg(signatureUrl);

            if (from.IsNotNullOrEmpty())
                await signaturePath.AddQrcodeAsync();
            else
                await signaturePath.AddWatermarkAsync();

            return $"{(name + id).Md5()}.png";
        }
    }
}