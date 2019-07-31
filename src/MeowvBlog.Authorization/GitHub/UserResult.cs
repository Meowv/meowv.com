namespace MeowvBlog.Authorization.GitHub
{
    public class UserResult
    {
        public string login { get; set; }

        public int id { get; set; }

        public string avatar_url { get; set; }

        public string html_url { get; set; }

        public string repos_url { get; set; }

        public string name { get; set; }

        public string company { get; set; }

        public string blog { get; set; }

        public string location { get; set; }

        public string email { get; set; }

        public string bio { get; set; }

        public int public_repos { get; set; }
    }
}