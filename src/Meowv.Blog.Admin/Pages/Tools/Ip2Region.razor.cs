using Meowv.Blog.Response;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace Meowv.Blog.Admin.Pages.Tools
{
    public partial class Ip2Region
    {
        string ip;
        string returnIp;
        string region;

        protected override async Task OnInitializedAsync()
        {
            await OnSearch();
        }

        public async Task OnSearch()
        {
            var response = await GetResultAsync<BlogResponse<List<string>>>($"api/meowv/tool/ip2region?ip={ip}");
            if (!response.Success)
            {
                await Message.Error(response.Message);
            }
            else
            {
                var result = response.Result;
                returnIp = result.First();
                region = string.Join(" ", result.Skip(1));
            }
        }
    }
}