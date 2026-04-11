CREATE TABLE "user" (
	"user_id"	INTEGER NOT NULL UNIQUE,
	"username"	TEXT NOT NULL,
	"password"	TEXT,
	"ip"	TEXT UNIQUE,
	"creat_time"	TEXT NOT NULL,
	"update_time"	TEXT NOT NULL,
	PRIMARY KEY("user_id")
)