using MeowvBlog.MTA;
using Microsoft.AspNetCore.Mvc;

namespace MeowvBlog.Web.Controllers.Apis
{
    [Route("api/[controller]")]
    [ApiController]
    public class MTAController : ControllerBase
    {
        [HttpGet]
        [Route("ctr_core_data")]
        public MtaResult ctr_core_data()
        {
            
        }
    }
}