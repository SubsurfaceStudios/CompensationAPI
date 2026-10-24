CREATE TABLE IF NOT EXISTS Image (
	id UUID
		NOT NULL
		PRIMARY KEY,
	
	uploader_id UUID
		NOT NULL
		REFERENCES player (id)
		ON DELETE CASCADE
		ON UPDATE CASCADE
		DEFERRABLE INITIALLY IMMEDIATE,
	
	uploaded TimestampTZ
		NOT NULL
		DEFAULT NOW(),
	
	blob_url Text
		NOT NULL,
	
	caption Text,

	show_in_feed Boolean
		NOT NULL
		DEFAULT FALSE
);

-- add profile_picture to player
ALTER TABLE player ADD COLUMN
	profile_picture UUID
		REFERENCES image (id)
		ON DELETE SET NULL (profile_picture)
		ON UPDATE CASCADE
		DEFERRABLE INITIALLY IMMEDIATE;