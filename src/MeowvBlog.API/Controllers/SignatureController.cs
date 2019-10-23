using MeowvBlog.Core;
using Microsoft.AspNetCore.Mvc;
using System.Net.Http;

namespace MeowvBlog.API.Controllers
{
    [ApiController]
    [Route("[controller]")]
    [Produces("application/json")]
    [ApiExplorerSettings(GroupName = GlobalConsts.GroupName_v3)]
    public class SignatureController : ControllerBase
    {
        private readonly IHttpClientFactory _httpClient;
        private readonly MeowvBlogDBContext _context;

        public SignatureController(IHttpClientFactory httpClient, MeowvBlogDBContext context)
        {
            _httpClient = httpClient;
            _context = context;
        }
    }
}