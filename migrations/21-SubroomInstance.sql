CREATE TABLE IF NOT EXISTS subroom_instance (
	room_instance_id UUID
		NOT NULL
		REFERENCES room_instance (id)
		ON DELETE CASCADE
		ON UPDATE CASCADE
		DEFERRABLE INITIALLY IMMEDIATE,
	
	room_id UUID
		NOT NULL
		REFERENCES room (id)
		ON DELETE CASCADE
		ON UPDATE CASCADE
		DEFERRABLE INITIALLY IMMEDIATE,
	
	subroom Text
		NOT NULL,
	
	photon_room_name Text
		NOT NULL,
	
	expires TimestampTZ,

	FOREIGN KEY (room_id, subroom)
		REFERENCES subroom (room_id, subroom_name)
		ON DELETE CASCADE
		ON UPDATE CASCADE
		DEFERRABLE INITIALLY IMMEDIATE,
	PRIMARY KEY (room_instance_id, subroom)
);

-- add instance info to player
ALTER TABLE player ADD COLUMN
	room_instance_id UUID;
ALTER TABLE player ADD COLUMN
	subroom_name Text;
ALTER TABLE player ADD
	FOREIGN KEY (room_instance_id, subroom_name)
		REFERENCES subroom_instance (room_instance_id, subroom)
		ON DELETE SET NULL (room_instance_id, subroom_name)
		ON UPDATE CASCADE
		DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE player ADD
	FOREIGN KEY (room_instance_id)
		REFERENCES room_instance (id)
		ON DELETE SET NULL
		ON UPDATE CASCADE
		DEFERRABLE INITIALLY IMMEDIATE;
