using MeowvBlog.Core;
using Microsoft.AspNetCore.Mvc;

namespace MeowvBlog.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [ApiExplorerSettings(GroupName = "v1")]
    public class BlogController : ControllerBase
    {
        private readonly MeowvBlogDBContext _context;

        public BlogController(MeowvBlogDBContext context)
        {
            _context = context;
        }
    }
}