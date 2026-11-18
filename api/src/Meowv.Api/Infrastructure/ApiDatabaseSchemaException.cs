namespace Meowv.Api.Infrastructure;

public sealed class ApiDatabaseSchemaException(string owner, int expectedVersion, long actualVersion)
    : InvalidOperationException($"数据库模块 {owner} 的结构版本不兼容：当前 {actualVersion}，程序要求 {expectedVersion}。")
{
    public int ExpectedVersion { get; } = expectedVersion;
    public long ActualVersion { get; } = actualVersion;
}