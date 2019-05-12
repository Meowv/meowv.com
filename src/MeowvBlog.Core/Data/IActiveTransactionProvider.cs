using System.Data;

namespace MeowvBlog.Core.Data
{
    public interface IActiveTransactionProvider
    {
        IDbTransaction GetActiveTransaction(ActiveTransactionProviderArgs args);

        IDbConnection GetActiveConnection(ActiveTransactionProviderArgs args);
    }
}