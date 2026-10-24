CREATE TABLE IF NOT EXISTS player (
	id UUID
		NOT NULL
		PRIMARY KEY,
	
	username Text
		NOT NULL
		CHECK (username ~ '^[a-zA-Z][a-zA-Z0-9\-\_]{2,31}$'),
	password_hash Text
		NOT NULL,

	created TimestampTZ
		NOT NULL
		DEFAULT NOW(),

	is_totp_enabled Boolean
		NOT NULL
		DEFAULT false,
	is_totp_verified Boolean
		NOT NULL
		DEFAULT false,
	totp_secret Text,

	nickname Text
		NOT NULL,
	pronouns Text
		NOT NULL
		DEFAULT 'Ask Me',
	tag Text
		NOT NULL
		DEFAULT '',
	bio Text
		NOT NULL
		DEFAULT 'This player hasn''t written a bio yet! Ask them about themselves!',

	is_admin Boolean
		NOT NULL
		DEFAULT false,

	email_address Text,
	is_email_verified Boolean
		NOT NULL
		DEFAULT false,

	currency_balance Integer
		NOT NULL
		DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS uniqueUsernamesCaseInsensitive ON player (lower(username));