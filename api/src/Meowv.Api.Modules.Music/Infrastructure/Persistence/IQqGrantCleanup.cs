using Microsoft.Data.Sqlite;

namespace Meowv.Api.Modules.Music.Infrastructure.Persistence;

/// <summary>QQ 会员授权的跨聚合清理边界；保持原表结构与事务语义不变。</summary>
internal interface IQqGrantCleanup
{
    void Clear(SqliteCommand command);
}
