CREATE TABLE IF NOT EXISTS room_role (
	room_id UUID
		NOT NULL
		REFERENCES room (id)
		ON DELETE CASCADE
		ON UPDATE CASCADE
		DEFERRABLE INITIALLY IMMEDIATE,
	
	name Text
		NOT NULL,
	
	can_view Boolean
		NOT NULL
		DEFAULT false,
	
	can_create_versions Boolean
		NOT NULL
		DEFAULT false,
	
	can_set_public_version Boolean
		NOT NULL
		DEFAULT false,
	
	can_view_settings Boolean
		NOT NULL
		DEFAULT false,
	
	can_view_permissions Boolean
		NOT NULL
		DEFAULT false,

	can_manage_permissions Boolean
		NOT NULL
		DEFAULT false,
	
	can_use_creation_tool Boolean
		NOT NULL
		DEFAULT false,
	
	can_kick_players Boolean
		NOT NULL
		DEFAULT false,
	
	can_mute_players Boolean
		NOT NULL
		DEFAULT false,
	
	can_manage_subrooms Boolean
		NOT NULL
		DEFAULT false,
	
	can_delete_subrooms Boolean
		NOT NULL
		DEFAULT false,
	
	can_edit_description Boolean
		NOT NULL
		DEFAULT false,
	
	can_set_home_subroom Boolean
		NOT NULL
		DEFAULT false,
	
	can_manage_tags Boolean
		NOT NULL
		DEFAULT false,
	
	can_manage_content_flags Boolean
		NOT NULL
		DEFAULT false,
	
	can_set_room_photo Boolean
		NOT NULL
		DEFAULT false,
	
	can_fly Boolean
		NOT NULL
		DEFAULT false,

	PRIMARY KEY (room_id, name)
);