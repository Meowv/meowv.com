using MeowvBlog.Services.Sign;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Plus;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace MeowvBlog.Web.Controllers.Apis
{
    [Route("api/[controller]")]
    [AllowAnonymous]
    [ApiController]
    public class SignController : ControllerBase
    {
        private readonly ISignService _signService;

        public SignController()
        {
            _signService = PlusEngine.Instance.Resolve<ISignService>();
        }

        /// <summary>
        /// 获取所有签名的类型
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("sign_type")]
        public async Task<IList<NameValue<int>>> GetSignType()
        {
            return await _signService.GetSignType();
        }
    }
}