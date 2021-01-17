using Meowv.Blog.Domain.Sayings.Repositories;

namespace Meowv.Blog.Sayings.Impl
{
    public partial class SayingService : ServiceBase, ISayingService
    {
        private readonly ISayingRepository _sayings;

        public SayingService(ISayingRepository sayings)
        {
            _sayings = sayings;
        }
    }
}