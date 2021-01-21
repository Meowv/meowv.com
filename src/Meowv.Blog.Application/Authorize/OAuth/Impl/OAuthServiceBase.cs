using Meowv.Blog.Domain.Users;
using Meowv.Blog.Users;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using System;
using System.Net.Http;
using System.Threading.Tasks;
using Volo.Abp.DependencyInjection;

namespace Meowv.Blog.Authorize.OAuth.Impl
{
    public abstract class OAuthServiceBase<TOptions, TAccessToke, TUserInfo> : IOAuthService<TAccessToke, TUserInfo>, ITransientDependency where TOptions : class where TAccessToke : class where TUserInfo : class
    {
        protected readonly object ServiceProviderLock = new object();

        public IServiceProvider ServiceProvider { get; set; }

        public IOptions<TOptions> Options { get; set; }

        private IUserService _userService;

        private IHttpClientFactory _httpClient;

        protected IUserService UserService => LazyGetRequiredService(ref _userService);

        protected IHttpClientFactory HttpClient => LazyGetRequiredService(ref _httpClient);

        protected TService LazyGetRequiredService<TService>(ref TService reference)
        {
            return LazyGetRequiredService(typeof(TService), ref reference);
        }

        protected TRef LazyGetRequiredService<TRef>(Type serviceType, ref TRef reference)
        {
            if (reference == null)
            {
                lock (ServiceProviderLock)
                {
                    if (reference == null)
                    {
                        reference = (TRef)ServiceProvider.GetRequiredService(serviceType);
                    }
                }
            }

            return reference;
        }

        public virtual Task<string> GetAuthorizeUrl(string state) => throw new NotImplementedException();

        public virtual Task<User> GetUserByOAuthAsync(string type, string code, string state) => throw new NotImplementedException();

        public virtual Task<TAccessToke> GetAccessTokenAsync(string code, string state) => throw new NotImplementedException();

        public virtual Task<TUserInfo> GetUserInfoAsync(TAccessToke accessToken) => throw new NotImplementedException();
    }
}