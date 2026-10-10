CREATE TABLE IF NOT EXISTS subroom_version (
	room_id UUID
		NOT NULL
		REFERENCES room (id)
		ON DELETE CASCADE
		ON UPDATE CASCADE
		DEFERRABLE INITIALLY IMMEDIATE,
	
	subroom_name Text
		NOT NULL,

	author_id UUID
		REFERENCES player (id)
		ON DELETE SET NULL (author_id)
		ON UPDATE CASCADE
		DEFERRABLE INITIALLY IMMEDIATE,
	
	created TimestampTZ
		NOT NULL
		DEFAULT NOW(),
	
	base_scene_name Text
		NOT NULL
		DEFAULT 'BaseScene',
	
	summary Text
		NOT NULL,
	
	description Text,

	blob_url Text,
	
	FOREIGN KEY (room_id, subroom_name)
		REFERENCES subroom (room_id, subroom_name)
		ON DELETE CASCADE
		ON UPDATE CASCADE
		DEFERRABLE INITIALLY IMMEDIATE,
	PRIMARY KEY (room_id, subroom_name, created)
);

ALTER TABLE subroom ADD COLUMN
	public_version_timestamp TimestampTZ
		NOT NULL;
		
ALTER TABLE subroom ADD
	FOREIGN KEY (room_id, subroom_name, public_version_timestamp)
	REFERENCES subroom_version (room_id, subroom_name, created)
	ON DELETE RESTRICT
	ON UPDATE CASCADE
	DEFERRABLE INITIALLY IMMEDIATE;