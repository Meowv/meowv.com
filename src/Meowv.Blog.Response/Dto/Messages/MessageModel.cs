namespace Meowv.Blog.Dto.Messages
{
    public class MessageModel
    {
        public string HtmlContent { get; set; }
        public string Nickname { get; set; }
        public string PubTime { get; set; }
        public string ReplyList { get; set; }
    }

    public class ReplyList
    {
        public string Content { get; set; }
        public string Nick { get; set; }
        public string Time { get; set; }
    }
}