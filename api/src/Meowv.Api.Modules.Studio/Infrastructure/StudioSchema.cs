namespace Meowv.Api.Modules.Studio.Infrastructure;

public static class StudioSchema
{
    public const string Owner = "studio";
    public const int Version = 1;

    public const string Ddl = """
                              CREATE TABLE IF NOT EXISTS studio_users (
                                  id TEXT PRIMARY KEY,
                                  username TEXT NOT NULL,
                                  username_lower TEXT NOT NULL,
                                  email TEXT NOT NULL,
                                  password_hash TEXT NOT NULL,
                                  role TEXT NOT NULL,
                                  email_verified INTEGER NOT NULL DEFAULT 0,
                                  email_verified_at TEXT NULL,
                                  avatar_path TEXT NULL,
                                  created_at TEXT NOT NULL,
                                  updated_at TEXT NOT NULL,
                                  revision INTEGER NOT NULL DEFAULT 0
                              );

                              CREATE UNIQUE INDEX IF NOT EXISTS ux_studio_users_email ON studio_users(email);
                              CREATE UNIQUE INDEX IF NOT EXISTS ux_studio_users_username_lower ON studio_users(username_lower);

                              CREATE TABLE IF NOT EXISTS studio_sessions (
                                  id TEXT PRIMARY KEY,
                                  user_id TEXT NOT NULL,
                                  token_id TEXT NOT NULL,
                                  created_at TEXT NOT NULL,
                                  expires_at TEXT NOT NULL,
                                  revoked_at TEXT NULL,
                                  user_agent TEXT NULL,
                                  FOREIGN KEY (user_id) REFERENCES studio_users(id) ON DELETE CASCADE
                              );

                              CREATE UNIQUE INDEX IF NOT EXISTS ux_studio_sessions_token ON studio_sessions(token_id);
                              CREATE INDEX IF NOT EXISTS ix_studio_sessions_user_expires ON studio_sessions(user_id, expires_at);

                              CREATE TABLE IF NOT EXISTS studio_email_tokens (
                                  id TEXT PRIMARY KEY,
                                  user_id TEXT NOT NULL,
                                  purpose TEXT NOT NULL,
                                  token_hash TEXT NOT NULL,
                                  created_at TEXT NOT NULL,
                                  expires_at TEXT NOT NULL,
                                  used_at TEXT NULL,
                                  FOREIGN KEY (user_id) REFERENCES studio_users(id) ON DELETE CASCADE
                              );

                              CREATE UNIQUE INDEX IF NOT EXISTS ux_studio_email_tokens_purpose_hash ON studio_email_tokens(purpose, token_hash);
                              CREATE INDEX IF NOT EXISTS ix_studio_email_tokens_user_purpose ON studio_email_tokens(user_id, purpose);

                              CREATE TABLE IF NOT EXISTS studio_preferences (
                                  user_id TEXT PRIMARY KEY,
                                  json TEXT NOT NULL,
                                  updated_at TEXT NOT NULL,
                                  FOREIGN KEY (user_id) REFERENCES studio_users(id) ON DELETE CASCADE
                              );

                              CREATE TABLE IF NOT EXISTS studio_layouts (
                                  user_id TEXT PRIMARY KEY,
                                  json TEXT NOT NULL,
                                  revision INTEGER NOT NULL,
                                  updated_at TEXT NOT NULL,
                                  FOREIGN KEY (user_id) REFERENCES studio_users(id) ON DELETE CASCADE
                              );

                              CREATE TABLE IF NOT EXISTS studio_email_outbox (
                                  id TEXT PRIMARY KEY,
                                  user_id TEXT NOT NULL,
                                  purpose TEXT NOT NULL,
                                  recipient TEXT NOT NULL,
                                  subject TEXT NOT NULL,
                                  html_body TEXT NOT NULL,
                                  created_at TEXT NOT NULL,
                                  attempts INTEGER NOT NULL DEFAULT 0,
                                  next_attempt_at TEXT NOT NULL,
                                  sent_at TEXT NULL,
                                  last_error TEXT NULL,
                                  FOREIGN KEY (user_id) REFERENCES studio_users(id) ON DELETE CASCADE
                              );

                              CREATE INDEX IF NOT EXISTS ix_studio_email_outbox_pending ON studio_email_outbox(sent_at, next_attempt_at);
                              """;
}