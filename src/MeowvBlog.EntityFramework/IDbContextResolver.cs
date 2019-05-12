using Microsoft.EntityFrameworkCore;
using System.Data.Common;

public interface IDbContextResolver
{
    TDbContext Resolve<TDbContext>(string connectionString, DbConnection existingConnection) where TDbContext : DbContext;
}

public interface IDbContextProvider<out TDbContext> where TDbContext : DbContext
{
    TDbContext GetDbContext();
}