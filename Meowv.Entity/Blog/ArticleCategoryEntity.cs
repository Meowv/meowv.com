using Meowv.Entity.Common;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Meowv.Entity.Blog
{
    [Table("article_categories")]
    public class ArticleCategoryEntity : CommonEntity
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public int Id { get; set; }

        public int ArticleId { get; set; }

        public int CategoryId { get; set; }
    }
}