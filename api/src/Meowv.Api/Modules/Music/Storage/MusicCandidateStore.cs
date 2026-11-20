using System.Text.Json;
using System.Text.Json.Serialization;
using Meowv.Api.Infrastructure;
using Meowv.Api.Modules.Music.Contracts;

namespace Meowv.Api.Modules.Music.Storage;

internal sealed record MusicCandidateSource(MusicTrack Track, string? MediaId = null, long MediaSize = 0, bool? RequiresMembership = null);

internal sealed record MusicCandidate(
    MusicCandidateSource[] Sources,
    DateTimeOffset Added,
    DateTimeOffset Seen,
    bool Discovery,
    bool Private = false);

internal sealed record MusicCandidateState(MusicCandidate[] Items, Dictionary<string, string> Positions, int Turn, DateTimeOffset Refreshed);

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(MusicCandidateState))]
internal sealed partial class MusicCandidateJsonContext : JsonSerializerContext;

internal sealed class MusicCandidateStore(ApiDatabase database)
{
    private readonly Lock _gate = new();
    private bool _initialized;
    internal static MusicCandidateState Empty => new([], [], 0, default);

    private void Initialize()
    {
        lock (_gate)
        {
            if (_initialized) return;
            database.EnsureSchema("music-recommendation-candidates", 1, """
                                                                        CREATE TABLE music_recommendation_candidates (
                                                                            id INTEGER PRIMARY KEY CHECK (id = 1),
                                                                            state_json TEXT NOT NULL
                                                                        );
                                                                        """);
            _initialized = true;
        }
    }

    public MusicCandidateState Read()
    {
        Initialize();
        using var connection = database.OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT state_json FROM music_recommendation_candidates WHERE id = 1;";
        return command.ExecuteScalar() is string json
            ? JsonSerializer.Deserialize(json, MusicCandidateJsonContext.Default.MusicCandidateState) ?? Empty
            : Empty;
    }

    public void Write(MusicCandidateState state)
    {
        Initialize();
        using var connection = database.OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
                              INSERT INTO music_recommendation_candidates (id, state_json) VALUES (1, $state)
                              ON CONFLICT(id) DO UPDATE SET state_json = excluded.state_json;
                              """;
        command.Parameters.AddWithValue("$state", JsonSerializer.Serialize(state, MusicCandidateJsonContext.Default.MusicCandidateState));
        command.ExecuteNonQuery();
    }
}