using Microsoft.Data.Sqlite;

namespace Meowv.Api.Modules.Studio.Infrastructure;

public sealed partial class StudioDatabase(ApiDatabase database, ILogger<StudioDatabase> logger)
{
    private readonly Lock _sync = new();
    private bool _initialized;

    public void Initialize()
    {
        lock (_sync)
        {
            if (_initialized) return;

            using (var connection = database.OpenConnection())
            {
                Execute(connection, "PRAGMA journal_mode=WAL;");
                Execute(connection, "PRAGMA synchronous=NORMAL;");
            }

            database.EnsureSchema(StudioSchema.Owner, StudioSchema.Version, StudioSchema.Ddl);
            _initialized = true;
            LogInitialized();
        }
    }

    public SqliteConnection OpenConnection()
    {
        var connection = database.OpenConnection();
        try
        {
            Execute(connection, "PRAGMA foreign_keys=ON;");
            Execute(connection, "PRAGMA busy_timeout=5000;");
            return connection;
        }
        catch
        {
            connection.Dispose();
            throw;
        }
    }

    private static void Execute(SqliteConnection connection, string sql)
    {
        using var command = connection.CreateCommand();
        command.CommandText = sql;
        command.ExecuteNonQuery();
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Studio schema ready.")]
    private partial void LogInitialized();
}