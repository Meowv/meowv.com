using Meowv.Blog.Response;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Blog.Admin.Pages
{
    public partial class Index
    {
        List<NameValue> data = new List<NameValue>();

        bool isLoading = true;

        protected override async Task OnInitializedAsync()
        {
            var response = await GetResultAsync<BlogResponse<List<NameValue>>>("api/meowv/health");
            if (response.Success)
            {
                data = response.Result;

                isLoading = false;
            }
            else
            {
                await Message.Error(response.Message);
            }
        }

        class NameValue
        {
            public string Name { get; set; }

            public string Value { get; set; }
        }
    }
}