namespace Meowv.Models.AppSetting
{
    public class AppSettings
    {
        /// <summary>
        /// 猫图数量
        /// </summary>
        public int CatCount { get; set; }

        /// <summary>
        /// 猫图绝对路径
        /// </summary>
        public string CatPath { get; set; }

        /// <summary>
        /// 域名
        /// </summary>
        public string Domain { get; set; }

        /// <summary>
        /// 安全密匙
        /// </summary>
        public string SecurityKey { get; set; }

        /// <summary>
        /// 用户名
        /// </summary>
        public string UserName { get; set; }

        /// <summary>
        /// 密码
        /// </summary>
        public string Password { get; set; }
    }
}