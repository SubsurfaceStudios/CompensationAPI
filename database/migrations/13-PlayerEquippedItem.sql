CREATE TABLE IF NOT EXISTS equipped_item (
	player_id UUID
		NOT NULL
		REFERENCES player (id)
		ON DELETE CASCADE
		ON UPDATE CASCADE,
	item_id UUID
		NOT NULL
		REFERENCES item (id)
		ON DELETE CASCADE
		ON UPDATE CASCADE,
	slot Text
		NOT NULL,
	
	PRIMARY KEY (player_id, slot)
);
 