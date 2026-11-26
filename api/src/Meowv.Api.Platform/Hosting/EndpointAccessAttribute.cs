namespace Meowv.Api.Platform.Hosting;

[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = true)]
public sealed class EndpointAccessAttribute(string requirement) : Attribute
{
    public string Requirement { get; } = requirement;
}