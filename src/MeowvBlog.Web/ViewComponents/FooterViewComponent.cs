using Microsoft.AspNetCore.Mvc;

namespace MeowvBlog.Web.ViewComponents
{
    public class FooterViewComponent : ViewComponent
    {
        public IViewComponentResult Invoke(bool show = true)
        {
            return View("Footer", show);
        }
    }
}