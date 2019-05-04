using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace MeowvBlog.SOA
{
    /// <summary>
    /// 前台继承此类
    /// </summary>
    [AllowAnonymous]
    public class PageBase : PageModel
    {
    }

    /// <summary>
    /// 后台继承此类
    /// </summary>
    [Authorize]
    public class AdminPageBase : PageBase
    {
    }

    /// <summary>
    /// API继承此类
    /// </summary>
    [Authorize]
    public class ApiControllerBase : ControllerBase
    {
    }
}