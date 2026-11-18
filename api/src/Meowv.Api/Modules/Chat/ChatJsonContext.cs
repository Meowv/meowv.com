using System.Text.Json.Serialization;

namespace Meowv.Api.Modules.Chat;

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(ChatSessionRequest))]
[JsonSerializable(typeof(ChatSessionResponse))]
[JsonSerializable(typeof(ChatMessage))]
[JsonSerializable(typeof(ChatMentionRequest[]))]
[JsonSerializable(typeof(ChatMention[]))]
[JsonSerializable(typeof(ChatParticipant[]))]
[JsonSerializable(typeof(ChatMessagePage))]
[JsonSerializable(typeof(ChatMessageContext))]
[JsonSerializable(typeof(ChatAck))]
[JsonSerializable(typeof(ChatDeleted))]
[JsonSerializable(typeof(ChatPresence))]
[JsonSerializable(typeof(ChatStatus))]
[JsonSerializable(typeof(ChatError))]
[JsonSerializable(typeof(ChatHealth))]
[JsonSerializable(typeof(string))]
public partial class ChatJsonContext : JsonSerializerContext;