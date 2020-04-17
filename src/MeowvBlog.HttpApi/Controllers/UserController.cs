using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Volo.Abp.AspNetCore.Mvc;

namespace MeowvBlog.Controllers
{
    [Route("api/user")]
    public abstract class UserController : AbpController
    {
        [HttpGet]
        [Route("get")]
        public IActionResult Get()
        {
            return Json("123");
        }
    }
}