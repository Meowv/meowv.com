using Microsoft.Data.Sqlite;

namespace Meowv.Api.Modules.Music.Infrastructure.Persistence;

internal sealed class SqliteQqGrantCleanup : IQqGrantCleanup
{
    public void Clear(SqliteCommand command)
    {
        // 会员模块可能从未初始化。
        command.CommandText = "SELECT 1 FROM sqlite_schema WHERE type='table' AND name='music_qq_devices';";
        if (command.ExecuteScalar() is null) return;
        command.CommandText = "DELETE FROM music_qq_devices WHERE device_id=$id;";
        command.ExecuteNonQuery();
    }
}
