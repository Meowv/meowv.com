using AntDesign;
using Meowv.Blog.Dto.Signatures;
using Meowv.Blog.Response;
using System.Collections.Generic;
using System.Net.Http;
using System.Threading.Tasks;

namespace Meowv.Blog.Admin.Pages.Signatures
{
    public partial class SignatureList
    {
        int page = 1;
        int limit = 10;
        int total = 0;
        IReadOnlyList<SignatureDto> signatures;

        protected override async Task OnInitializedAsync()
        {
            signatures = await GetSignatureListAsync(page, limit);
        }

        public async Task HandlePageIndexChange(PaginationEventArgs args)
        {
            signatures = await GetSignatureListAsync(page, limit);
        }

        public async Task<IReadOnlyList<SignatureDto>> GetSignatureListAsync(int page, int limit)
        {
            var response = await GetResultAsync<BlogResponse<PagedList<SignatureDto>>>($"api/meowv/signatures/{page}/{limit}");

            total = response.Result.Total;

            return response.Result.Item;
        }

        public async Task DeleteAsync(string id)
        {
            var response = await GetResultAsync<BlogResponse>($"api/meowv/signature/{id}", method: HttpMethod.Delete);
            if (response.Success)
            {
                await Message.Success("Successful", 0.5);
                signatures = await GetSignatureListAsync(page, limit);
            }
            else
            {
                await Message.Error(response.Message);
            }
        }
    }
}