using Meowv.Blog.Domain.Blog;
using Meowv.Blog.Domain.Hots;
using Meowv.Blog.Domain.Messages;
using Meowv.Blog.Domain.Sayings;
using Meowv.Blog.Domain.Signatures;
using Meowv.Blog.Domain.Users;
using MongoDB.Driver;
using Volo.Abp.MongoDB;
using Tag = Meowv.Blog.Domain.Blog.Tag;

namespace Meowv.Blog
{
    public class MeowvBlogMongoDbContext : AbpMongoDbContext
    {
        public IMongoCollection<Post> Posts => Collection<Post>();

        public IMongoCollection<Category> Categories => Collection<Category>();

        public IMongoCollection<Tag> Tags => Collection<Tag>();

        public IMongoCollection<FriendLink> FriendLinks => Collection<FriendLink>();

        public IMongoCollection<Hot> Hots => Collection<Hot>();

        public IMongoCollection<Saying> Sayings => Collection<Saying>();

        public IMongoCollection<Signature> Signatures => Collection<Signature>();

        public IMongoCollection<Message> Messages => Collection<Message>();

        public IMongoCollection<User> Users => Collection<User>();

        protected override void CreateModel(IMongoModelBuilder modelBuilder)
        {
            base.CreateModel(modelBuilder);

            modelBuilder.Configure();
        }
    }
}