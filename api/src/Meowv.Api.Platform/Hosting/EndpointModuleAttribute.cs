namespace Meowv.Api.Platform.Hosting;

[AttributeUsage(AttributeTargets.Class)]
public sealed class EndpointModuleAttribute(string name) : Attribute
{
    public string Name { get; } = name;

    public Type? OptionsType { get; init; }

    public Type? RuntimeType { get; init; }
}