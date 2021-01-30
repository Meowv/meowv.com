using Meowv.Blog.Response;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Blog.Admin.Pages
{
    public partial class Index
    {
        List<NameValue> data = new List<NameValue>();

        Tuple<int, int, int> statistics = new Tuple<int, int, int>(888, 888, 888);

        bool isLoading = true;

        protected override async Task OnInitializedAsync()
        {
            var statisticsResponse = await GetResultAsync<BlogResponse<Tuple<int, int, int>>>("api/meowv/blog/statistics");
            if (statisticsResponse.Success)
            {
                statistics = statisticsResponse.Result;
            }
            else
            {
                await Message.Error(statisticsResponse.Message);
            }

            var healthResponse = await GetResultAsync<BlogResponse<List<NameValue>>>("api/meowv/health");
            if (healthResponse.Success)
            {
                data = healthResponse.Result;

                isLoading = false;
            }
            else
            {
                await Message.Error(healthResponse.Message);
            }
        }

        class NameValue
        {
            public string Name { get; set; }

            public string Value { get; set; }
        }
    }
}