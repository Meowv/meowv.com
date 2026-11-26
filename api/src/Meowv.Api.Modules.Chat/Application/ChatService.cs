namespace Meowv.Api.Modules.Chat.Application;

public sealed class ChatService(ChatSessionService sessions, ChatRepository repository, ChatOptions options, ChatSendLimiter limiter, ChatPresenceService presence, ChatBroadcastQueue broadcasts, ILogger<ChatService> logger)
{
    internal SemaphoreSlim Gate { get; } = new(1, 1);

    private ChatMention[] ResolveMentions(string senderId, string content, ChatMentionRequest[]? requests)
    {
        if (requests is null || requests.Length == 0) return [];
        if (requests.Length > 10) throw new ChatException("invalid_mention", "每条消息最多提及 10 次。");
        var online = presence.OnlineGuests.ToDictionary(guest => guest.Id);
        var mentions = new List<ChatMention>();
        var end = 0;
        foreach (var request in requests.OrderBy(request => request.Start))
        {
            if (!Guid.TryParseExact(request.GuestId, "D", out var parsed)) throw new ChatException("invalid_mention", "提及的访客无效。");
            var guestId = parsed.ToString();
            if (guestId == senderId) throw new ChatException("invalid_mention", "不能提及自己。");
            var guest = online.GetValueOrDefault(guestId) ?? repository.PublicGuest(guestId);
            if (guest is null) throw new ChatException("invalid_mention", "提及的访客已不可用，请重新选择。");
            var token = "@" + guest.Nickname;
            if (request.Start < end || request.Start < 0 || request.Length != token.Length || request.Start > content.Length - request.Length || !content.AsSpan(request.Start, request.Length).SequenceEqual(token.AsSpan()))
                throw new ChatException("invalid_mention", "提及内容已改变，请重新选择访客。");
            mentions.Add(new ChatMention(guest.Id, guest.Nickname, request.Start, request.Length));
            end = request.Start + request.Length;
        }

        return [.. mentions];
    }

    internal async Task<ChatAck> SendAsync(CallerContext caller, string clientMessageId, string content, string? replyToId = null, ChatMentionRequest[]? mentions = null, CancellationToken cancellationToken = default)
    {
        await Gate.WaitAsync(cancellationToken);
        try
        {
            var session = sessions.Require(caller);
            if (!Guid.TryParseExact(clientMessageId, "D", out var parsed)) throw new ChatException("invalid_message_id", "消息标识无效。");
            var id = parsed.ToString();
            var duplicate = repository.FindDuplicate(session.Guest.Id, id);
            if (duplicate is not null) return new ChatAck(duplicate.Id, duplicate.ClientMessageId, duplicate.CreatedAt, duplicate.Reply, duplicate.Mentions ?? []);
            var validated = ChatValidation.Content(content, options);
            if (replyToId is not null)
            {
                if (!long.TryParse(replyToId, System.Globalization.NumberStyles.None, System.Globalization.CultureInfo.InvariantCulture, out var replyId) || replyId < 1)
                    throw new ChatException("invalid_reply", "引用消息无效。");
                replyToId = replyId.ToString(System.Globalization.CultureInfo.InvariantCulture);
                var original = repository.Message(replyToId);
                if (original is null || original.Deleted || (options.MessageCleanupEnabled && original.CreatedAt < DateTimeOffset.UtcNow.AddDays(-options.RetentionDays)))
                    throw new ChatException("invalid_reply", "原消息已被移除或不可用，请取消引用后重试。");
            }

            var resolvedMentions = ResolveMentions(session.Guest.Id, validated, mentions);
            using var reservation = broadcasts.Reserve();
            cancellationToken.ThrowIfCancellationRequested();
            limiter.Check(session.Guest.Id, caller.Ip);
            var message = repository.Insert(session, id, validated, replyToId, resolvedMentions);
            reservation.Publish("message.created", message);

            return new ChatAck(message.Id, message.ClientMessageId, message.CreatedAt, message.Reply, message.Mentions ?? []);
        }
        catch (Exception error) when (error is not ChatException and not OperationCanceledException)
        {
            ChatDiagnostics.Failure(logger, error, "save", ChatDiagnostics.CorrelationId);
            throw;
        }
        finally
        {
            Gate.Release();
        }
    }
}