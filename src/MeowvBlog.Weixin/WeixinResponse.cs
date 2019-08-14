namespace MeowvBlog.Weixin
{
    public class WeixinResponse
    {
        public string Message { get; set; } = "success";

        public string Timestamp { get; set; }

        public string Noncestr { get; set; }

        public string Ticket { get; set; }

        public string Signature { get; set; }
    }
}