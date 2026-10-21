using Microsoft.Data.Sqlite;

namespace Meowv.Api.Infrastructure;

public sealed class ApiDatabase
{
    private readonly string _connectionString;

    public ApiDatabase(IConfiguration configuration, ApiPaths paths)
    {
        var configured = configuration.GetConnectionString("DefaultConnection");
        if (string.IsNullOrWhiteSpace(configured))
            throw new InvalidOperationException("缺少 ConnectionStrings:DefaultConnection。");

        var builder = new SqliteConnectionStringBuilder(configured);
        if (string.IsNullOrWhiteSpace(builder.DataSource) || builder.DataSource == ":memory:" ||
            builder.DataSource.StartsWith("file:", StringComparison.OrdinalIgnoreCase) || builder.Mode == SqliteOpenMode.Memory)
            throw new InvalidOperationException("数据库必须配置为持久化文件路径。");

        builder.DataSource = paths.Resolve(builder.DataSource);

        Directory.CreateDirectory(Path.GetDirectoryName(builder.DataSource)!);

        _connectionString = builder.ToString();
    }

    public ApiDatabase(string connectionString)
    {
        _connectionString = connectionString;
    }

    public SqliteConnection OpenConnection()
    {
        var connection = new SqliteConnection(_connectionString);
        try
        {
            connection.Open();
            return connection;
        }
        catch
        {
            connection.Dispose();
            throw;
        }
    }

    public void EnsureSchema(string owner, int version, string sql)
    {
        using var connection = OpenConnection();
        using var transaction = connection.BeginTransaction();
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
                              CREATE TABLE IF NOT EXISTS schema_migrations (
                                  owner TEXT PRIMARY KEY, version INTEGER NOT NULL, applied_at TEXT NOT NULL
                              );
                              """;
        command.ExecuteNonQuery();
        command.CommandText = "SELECT version FROM schema_migrations WHERE owner = $owner;";
        command.Parameters.AddWithValue("$owner", owner);
        var current = command.ExecuteScalar();
        if (current is long existing)
        {
            if (existing != version) throw new ApiDatabaseSchemaException(owner, version, existing);
            transaction.Commit();
            return;
        }

        command.Parameters.Clear();
        command.CommandText = sql;
        command.ExecuteNonQuery();
        command.CommandText = "INSERT INTO schema_migrations(owner, version, applied_at) VALUES($owner, $version, $now);";
        command.Parameters.AddWithValue("$owner", owner);
        command.Parameters.AddWithValue("$version", version);
        command.Parameters.AddWithValue("$now", DateTimeOffset.UtcNow.ToString("O"));
        command.ExecuteNonQuery();
        transaction.Commit();
    }
}

public sealed class ApiDatabaseSchemaException(string owner, int expectedVersion, long actualVersion)
    : InvalidOperationException($"数据库模块 {owner} 的结构版本不兼容：当前 {actualVersion}，程序要求 {expectedVersion}。")
{
    public int ExpectedVersion { get; } = expectedVersion;
    public long ActualVersion { get; } = actualVersion;
}