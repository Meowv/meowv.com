using Meowv.Blog.Response;
using System;
using System.Threading.Tasks;

namespace Meowv.Blog.Blog
{
    public partial interface IBlogService
    {
        Task<BlogResponse<Tuple<int, int, int>>> GetStatisticsAsync();
    }
}