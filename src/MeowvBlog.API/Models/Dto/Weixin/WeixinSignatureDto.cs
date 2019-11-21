namespace MeowvBlog.API.Models.Dto.Weixin
{
    public class WeixinSignatureDto
    {
        public string Timestamp { get; set; }

        public string Noncestr { get; set; }

        public string Ticket { get; set; }

        public string Signature { get; set; }
    }
}