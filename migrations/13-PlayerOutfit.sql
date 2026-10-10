CREATE TABLE IF NOT EXISTS player_outfit (
	id UUID
		NOT NULL
		PRIMARY KEY,
	
	owner UUID
		NOT NULL
		REFERENCES player (id)
		ON DELETE CASCADE
		ON UPDATE CASCADE
		DEFERRABLE INITIALLY IMMEDIATE,
	
	skin_color Text
		NOT NULL
		DEFAULT '#E8BEAC',
	
	hair_style UUID
		REFERENCES item (id)
		ON DELETE SET NULL (hair_style)
		ON UPDATE CASCADE,
	
	hair_color Text
		NOT NULL
		DEFAULT '#000',
	
	top UUID
		REFERENCES item (id)
		ON DELETE SET NULL (top)
		ON UPDATE CASCADE,
	
	bottom UUID
		REFERENCES item (id)
		ON DELETE SET NULL (bottom)
		ON UPDATE CASCADE,
	
	jacket UUID
		REFERENCES item (id)
		ON DELETE SET NULL (jacket)
		ON UPDATE CASCADE,
	
	face UUID
		REFERENCES item (id)
		ON DELETE SET NULL (face)
		ON UPDATE CASCADE,
	
	headgear UUID
		REFERENCES item (id)
		ON DELETE SET NULL (headgear)
		ON UPDATE CASCADE,
	
	pin UUID
		REFERENCES item (id)
		ON DELETE SET NULL (pin)
		ON UPDATE CASCADE,
	
	glove_left UUID
		REFERENCES item (id)
		ON DELETE SET NULL (glove_left)
		ON UPDATE CASCADE,
	
	glove_right UUID
		REFERENCES item (id)
		ON DELETE SET NULL (glove_right)
		ON UPDATE CASCADE,
	
	belt UUID
		REFERENCES item (id)
		ON DELETE SET NULL (belt)
		ON UPDATE CASCADE,
	
	backpack UUID
		REFERENCES item (id)
		ON DELETE SET NULL (backpack)
		ON UPDATE CASCADE
);
-- add current_outfit to player
ALTER TABLE player ADD COLUMN
	current_outfit UUID
		REFERENCES player_outfit (id)
		ON DELETE CASCADE
		ON UPDATE CASCADE
		DEFERRABLE INITIALLY IMMEDIATE;
