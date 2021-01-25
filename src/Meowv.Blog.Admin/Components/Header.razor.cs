using AntDesign;
using System;

namespace Meowv.Blog.Admin.Components
{
    public partial class Header
    {
        public string Avatar { get; set; } = "https://static.meowv.com/images/avatar.jpg";

        public string Name { get; set; } = "阿星Plus";

        public void OnClickCallback(MenuItem item)
        {
            Console.WriteLine(item.Key);
        }
    }
}