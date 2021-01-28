namespace Meowv.Blog.Dto.Messages.Params
{
    public class CreateMessageInput
    {
        public string Name { get; set; }

        public string Content { get; set; }

        public string Avatar { get; set; }

        public string UserId { get; set; }
    }
}