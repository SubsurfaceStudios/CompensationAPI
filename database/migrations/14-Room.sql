CREATE TABLE IF NOT EXISTS room (
	id UUID
		NOT NULL
		PRIMARY KEY,
	
	owner_id UUID
		NOT NULL
		REFERENCES player (id)
		ON DELETE CASCADE
		ON UPDATE CASCADE
		DEFERRABLE INITIALLY IMMEDIATE,
	
	name Text
		NOT NULL,

	created TimestampTZ
		NOT NULL
		DEFAULT NOW(),
	
	description Text
		NOT NULL
		DEFAULT 'This room doesn''t have a description yet!',
	
	visits Integer
		NOT NULL
		DEFAULT 0,
	
	contains_sexual_content Boolean
		NOT NULL
		DEFAULT false,
	
	contains_gore Boolean
		NOT NULL
		DEFAULT false,
	
	contains_flashing_imagery Boolean
		NOT NULL
		DEFAULT false,
	
	contains_loud_sounds Boolean
		NOT NULL
		DEFAULT false,
	
	contains_addictive_substances Boolean
		NOT NULL
		DEFAULT false,
	
	contains_performance_issues Boolean
		NOT NULL
		DEFAULT false,
	
	is_adult_only Boolean
		NOT NULL
		DEFAULT false,
	
	custom_content_warning Text,

	cover_image UUID
		REFERENCES image (id)
		ON DELETE SET NULL (cover_image)
		ON UPDATE CASCADE
);
-- add spawn_room to player
ALTER TABLE player ADD COLUMN
	spawn_room UUID
		REFERENCES room (id)
		ON DELETE SET NULL (spawn_room)
		ON UPDATE CASCADE;