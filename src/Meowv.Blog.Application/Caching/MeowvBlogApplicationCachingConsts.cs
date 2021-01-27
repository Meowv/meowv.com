namespace Meowv.Blog.Caching
{
    public static class CachingConsts
    {
        public class CachePrefix
        {
            public const string Blog = "Blog";

            public const string Blog_Post = Blog + ":Post";
            public const string Blog_Category = Blog + ":Category";
            public const string Blog_Tag = Blog + ":Tag";
            public const string Blog_FriendLink = Blog + ":FriendLink";

            public const string Hot = "Hot";

            public const string Signature = "Signature";

            public static string Authorize = "Authorize:Code";
        }

        public class CacheKeys
        {
            public static string GetPostByUrl(string url) => $"{CachePrefix.Blog_Post}:GetByUrl-{url}";

            public static string GetPosts(int page, int limit) => $"{CachePrefix.Blog_Post}:Get-{page}-{limit}";

            public static string GetPostsByCategory(string category) => $"{CachePrefix.Blog_Post}:GetByCategory-{category}";

            public static string GetPostsByTag(string tag) => $"{CachePrefix.Blog_Post}:GetByTag-{tag}";

            public static string GetCategories() => $"{CachePrefix.Blog_Category}:Get";

            public static string GetTags() => $"{CachePrefix.Blog_Tag}:Get";

            public static string GetFriendLinks() => $"{CachePrefix.Blog_FriendLink}:Get";

            public static string GetSources() => $"{CachePrefix.Hot}:Sources";

            public static string GetHots(string source) => $"{CachePrefix.Hot}:{source}";

            public static string GetSignatureTypes() => $"{CachePrefix.Signature}:Types";

            public static string GenerateSignature(string name, int typeId) => $"{CachePrefix.Signature}:{name}-{typeId}";           
        }

        public class CacheStrategy
        {
            /// <summary>
            /// Never expire
            /// </summary>
            public const int NEVER = -1;

            /// <summary>
            /// Expires in 1 hour
            /// </summary>
            public const int ONE_HOURS = 60;

            /// <summary>
            /// Expires in 12 hours
            /// </summary>
            public const int HALF_DAY = 720;
        }
    }
}