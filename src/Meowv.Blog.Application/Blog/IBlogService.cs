using System.Threading.Tasks;

namespace Meowv.Blog.Blog
{
    public partial interface IBlogService
    {
        Task<int> Get();
    }
}