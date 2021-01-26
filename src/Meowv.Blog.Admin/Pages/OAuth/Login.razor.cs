using AntDesign;
using Meowv.Blog.Admin.Models;
using Microsoft.AspNetCore.Components;
using System.Threading.Tasks;

namespace Meowv.Blog.Admin.Pages.OAuth
{
    public partial class Login
    {
        private readonly LoginModel input = new LoginModel();

        [Inject] public NavigationManager NavigationManager { get; set; }

        [Inject] public MessageService Message { get; set; }

        public void HandleSubmit()
        {
            //if (_model.UserName == "admin" && _model.Password == "ant.design")
            //{
            //    NavigationManager.NavigateTo("/");
            //    return;
            //}

            //if (_model.UserName == "user" && _model.Password == "ant.design") NavigationManager.NavigateTo("/");
        }

        public async Task GetCode()
        {
            //var captcha = await AccountService.GetCaptchaAsync(_model.Mobile);
            //await Message.Success($"获取验证码成功！验证码为：{captcha}");
        }
    }
}