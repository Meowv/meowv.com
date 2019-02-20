using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Meowv.Entity;
using Meowv.Entity.Blog;

namespace Meowv.Web.API
{
    [Route("api/[controller]")]
    [ApiController]
    public class ArticleApiController : ControllerBase
    {
        private readonly MeowvDbContext _context;

        public ArticleApiController(MeowvDbContext context)
        {
            _context = context;
        }

        // GET: api/ArticleApi
        [HttpGet]
        public async Task<ActionResult<IEnumerable<ArticleEntity>>> GetArticles()
        {
            return await _context.Articles.ToListAsync();
        }

        // GET: api/ArticleApi/5
        [HttpGet("{id}")]
        public async Task<ActionResult<ArticleEntity>> GetArticleEntity(int id)
        {
            var articleEntity = await _context.Articles.FindAsync(id);

            if (articleEntity == null)
            {
                return NotFound();
            }

            return articleEntity;
        }

        // PUT: api/ArticleApi/5
        [HttpPut("{id}")]
        public async Task<IActionResult> PutArticleEntity(int id, ArticleEntity articleEntity)
        {
            if (id != articleEntity.ArticleId)
            {
                return BadRequest();
            }

            _context.Entry(articleEntity).State = EntityState.Modified;

            try
            {
                await _context.SaveChangesAsync();
            }
            catch (DbUpdateConcurrencyException)
            {
                if (!ArticleEntityExists(id))
                {
                    return NotFound();
                }
                else
                {
                    throw;
                }
            }

            return NoContent();
        }

        // POST: api/ArticleApi
        [HttpPost]
        public async Task<ActionResult<ArticleEntity>> PostArticleEntity(ArticleEntity articleEntity)
        {
            _context.Articles.Add(articleEntity);
            await _context.SaveChangesAsync();

            return CreatedAtAction("GetArticleEntity", new { id = articleEntity.ArticleId }, articleEntity);
        }

        // DELETE: api/ArticleApi/5
        [HttpDelete("{id}")]
        public async Task<ActionResult<ArticleEntity>> DeleteArticleEntity(int id)
        {
            var articleEntity = await _context.Articles.FindAsync(id);
            if (articleEntity == null)
            {
                return NotFound();
            }

            _context.Articles.Remove(articleEntity);
            await _context.SaveChangesAsync();

            return articleEntity;
        }

        private bool ArticleEntityExists(int id)
        {
            return _context.Articles.Any(e => e.ArticleId == id);
        }
    }
}
