using EasyCaching.InMemory;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using System;

namespace MeowvBlog.Caches.Tests
{
    [TestClass]
    public class EasyCaching_Tests
    {
        private readonly ICache _cache;

        public EasyCaching_Tests()
        {
            var services = new ServiceCollection();
            services.AddCache(options => options.UseInMemory());

            var provider = services.BuildServiceProvider();
            _cache = provider.GetService<ICache>();
        }

        [TestMethod]
        public void Cache_Tests()
        {
            _cache.TrySet("username", "qix");
            _cache.TrySet("github", "https://github.com/Meowv/");

            var username = _cache.Get<string>("username");
            Console.WriteLine($"username:{username.Value}");

            _cache.Remove("username");
            Console.WriteLine($"username:{username.Value}");

            var github = _cache.Get<string>("github");
            Console.WriteLine($"github:{github.Value}");

            Console.WriteLine(_cache.Exists("github"));

            var nickname = _cache.Get<string>("nickname");
            Console.WriteLine($"nickname:{nickname.Value}");

            var nickname2 = _cache.Get("nickname", () => "°¢ÐÇPlus");
            Console.WriteLine($"nickname:{nickname2.Value}");
        }
    }
}