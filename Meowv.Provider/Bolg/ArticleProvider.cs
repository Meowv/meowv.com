using Meowv.Entity.Blog;
using Meowv.Interface.Blog;
using System;
using System.Threading.Tasks;

namespace Meowv.Provider.Bolg
{
    public class ArticleProvider : IArticle
    {
        Task<bool> IArticle.AddArticle()
        {
            throw new NotImplementedException();
        }

        Task<bool> IArticle.DeleteArticle(int articleId)
        {
            throw new NotImplementedException();
        }

        Task<bool> IArticle.UpdateArticle(ArticleEntity entity)
        {
            throw new NotImplementedException();
        }
    }
}