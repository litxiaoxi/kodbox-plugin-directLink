DROP TABLE IF EXISTS "plugin_dl";
CREATE TABLE "plugin_dl" (
  "id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
  "token" varchar(64) NOT NULL,
  "path" text NOT NULL,
  "fileID" integer NOT NULL DEFAULT 0,
  "name" varchar(255) NOT NULL DEFAULT '',
  "ext" varchar(32) NOT NULL DEFAULT '',
  "size" integer NOT NULL DEFAULT 0,
  "userID" integer NOT NULL DEFAULT 0,
  "status" integer NOT NULL DEFAULT 1,
  "numView" integer NOT NULL DEFAULT 0,
  "numDownload" integer NOT NULL DEFAULT 0,
  "lastViewTime" integer NOT NULL DEFAULT 0,
  "createTime" integer NOT NULL DEFAULT 0,
  "modifyTime" integer NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX "idx_plugin_dl_token" ON "plugin_dl" ("token");
CREATE INDEX "idx_plugin_dl_userID" ON "plugin_dl" ("userID");
CREATE INDEX "idx_plugin_dl_status" ON "plugin_dl" ("status");
CREATE INDEX "idx_plugin_dl_createTime" ON "plugin_dl" ("createTime");
CREATE INDEX "idx_plugin_dl_user_status" ON "plugin_dl" ("userID","status");
CREATE INDEX "idx_plugin_dl_user_createTime" ON "plugin_dl" ("userID","createTime");
