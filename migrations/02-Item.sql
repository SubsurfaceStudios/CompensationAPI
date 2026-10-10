CREATE TABLE IF NOT EXISTS item (
	id UUID
		NOT NULL
		PRIMARY KEY,

	name TEXT
		NOT NULL,

	type TEXT,
	prefab TEXT
		NOT NULL,

	rarity INTEGER
		NOT NULL
		DEFAULT 0,
	
	purchase_price INTEGER,
	refund_price INTEGER,
	is_transferrable BOOLEAN
		NOT NULL
		DEFAULT FALSE
);
