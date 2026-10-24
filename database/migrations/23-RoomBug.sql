CREATE TABLE IF NOT EXISTS SubroomBug (
	room_id UUID
		NOT NULL
		REFERENCES room (id)
		ON DELETE CASCADE
		ON UPDATE CASCADE,

	subroom_name Text
		NOT NULL,
	
	x Real NOT NULL,
	y Real NOT NULL,
	z Real NOT NULL,

	summary Text
		NOT NULL,
	description Text
		NOT NULL,
		
	image_id UUID
		REFERENCES image (id)
		ON DELETE SET NULL
		ON UPDATE CASCADE,
	priority Text,

	reporter_id UUID
		REFERENCES player (id)
		ON DELETE SET NULL
		ON UPDATE CASCADE
);