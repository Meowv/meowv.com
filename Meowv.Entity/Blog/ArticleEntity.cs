using Meowv.Entity.Common;
using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Meowv.Entity.Blog
{
    [Table("articles")]
    public class ArticleEntity : CommonEntity
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public int ArticleId { get; set; }

        public int Title { get; set; }

        public string Url { get; set; }

        public string Content { get; set; }

        public DateTime PostTime { get; set; }
    }
}