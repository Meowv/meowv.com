using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;

namespace MeowvBlog.Captcha
{
    /// <summary>
    /// Captcha
    /// </summary>
    public static class Captcha
    {
        /// <summary>
        /// 生成随机验证码
        /// </summary>
        /// <param name="codeLength"></param>
        /// <returns></returns>
        public static string GenerateCaptchaCode(int codeLength = 4)
        {
            var Letters = "1,2,3,4,5,6,7,8,9,A,B,C,D,E,F,G,H,J,K,L,M,N,P,Q,R,S,T,U,V,W,X,Y,Z";

            var array = Letters.Split(new[] { ',' });

            var random = new Random();

            var temp = -1;

            var captcheCode = string.Empty;

            for (int i = 0; i < codeLength; i++)
            {
                if (temp != -1)
                    random = new Random(i * temp * unchecked((int)DateTime.Now.Ticks));

                var index = random.Next(array.Length);

                if (temp != -1 && temp == index)
                    return GenerateCaptchaCode(codeLength);

                temp = index;

                captcheCode += array[index];
            }
            return captcheCode;
        }

        /// <summary>
        /// 生成随机验证码图片
        /// </summary>
        /// <param name="captchaCode">随机验证码</param>
        /// <param name="width">宽为0将根据验证码长度自动匹配合适宽度</param>
        /// <param name="height">高</param>
        /// <returns></returns>
        public static CaptchaResult GenerateCaptchaImage(string captchaCode, int width = 0, int height = 30)
        {
            //验证码颜色集合
            Color[] c = { Color.Black, Color.Red, Color.DarkBlue, Color.Green, Color.Orange, Color.Brown, Color.DarkCyan, Color.Purple };

            //验证码字体集合
            string[] fonts = { "Verdana", "Microsoft Sans Serif", "Comic Sans MS", "Arial" };

            //定义图像的大小，生成图像的实例
            var image = new Bitmap(width == 0 ? captchaCode.Length * 25 : width, height);

            var g = Graphics.FromImage(image);

            //背景设为白色
            g.Clear(Color.White);

            var random = new Random();

            for (var i = 0; i < 100; i++)
            {
                var x = random.Next(image.Width);
                var y = random.Next(image.Height);
                g.DrawRectangle(new Pen(Color.LightGray, 0), x, y, 1, 1);
            }

            //验证码绘制在g中  
            for (var i = 0; i < captchaCode.Length; i++)
            {
                //随机颜色索引值 
                var cindex = random.Next(c.Length);

                //随机字体索引值 
                var findex = random.Next(fonts.Length);

                //字体 
                var f = new Font(fonts[findex], 15, FontStyle.Bold);

                //颜色  
                Brush b = new SolidBrush(c[cindex]);

                var ii = 4;
                if ((i + 1) % 2 == 0)
                    ii = 2;

                //绘制一个验证字符  
                g.DrawString(captchaCode.Substring(i, 1), f, b, 17 + (i * 17), ii);
            }

            var ms = new MemoryStream();
            image.Save(ms, ImageFormat.Png);

            g.Dispose();
            image.Dispose();

            return new CaptchaResult { CaptchaCode = captchaCode, CaptchaMemoryStream = ms, Timestamp = DateTime.Now };
        }
    }
}