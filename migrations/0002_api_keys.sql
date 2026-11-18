-- API keys for non-browser clients (MCP). Only a SHA-256 hash of the key is stored.
create table "api_key" (
  "id" text not null primary key,
  "user_id" text not null references "user" ("id") on delete cascade,
  "name" text not null,
  "prefix" text not null,
  "key_hash" text not null unique,
  "created_at" text not null,
  "last_used_at" text
);

create index "api_key_user_idx" on "api_key" ("user_id");
