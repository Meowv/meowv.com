using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace MeowvBlog.Web.Controllers.Apis
{
    [Route("api/[controller]")]
    [AllowAnonymous]
    [ApiController]
    public class HotNewsController : ControllerBase
    {

    }
}