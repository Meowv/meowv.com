using Meowv.Blog.Dto.Signatures;
using Meowv.Blog.Response;
using Microsoft.AspNetCore.Mvc.Rendering;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Threading.Tasks;

namespace Meowv.Blog.Web.Pages.Apps
{
    public class SignatureModel : PageBase
    {
        public SignatureModel(IHttpClientFactory httpClientFactory) : base(httpClientFactory)
        {
        }

        public List<SelectListItem> Options { get; set; }

        public async Task OnGetAsync()
        {
            var signatureTypes = await GetResultAsync<BlogResponse<List<SignatureTypeDto>>>("api/meowv/signature/types");

            Options = signatureTypes.Result.Select(x => new SelectListItem
            {
                Text = x.Type,
                Value = x.TypeId.ToString()
            }).ToList();
        }
    }
}