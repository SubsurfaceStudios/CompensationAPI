CREATE TABLE IF NOT EXISTS subroom (
	room_id UUID
		NOT NULL
		REFERENCES room (id)
		ON DELETE CASCADE
		ON UPDATE CASCADE
		DEFERRABLE INITIALLY IMMEDIATE,
	
	subroom_name Text
		NOT NULL,
	
	player_cap Integer
		NOT NULL
		DEFAULT 20,

	PRIMARY KEY (room_id, subroom_name)
);