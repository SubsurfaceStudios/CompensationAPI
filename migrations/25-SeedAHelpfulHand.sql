-- Note that we don't create an Apartment!
-- During the API rewrite, we switched to creating a new Apartment for every player,
-- so that they can customize it however they like!

BEGIN DEFERRABLE;
SET CONSTRAINTS ALL DEFERRED;

INSERT INTO room
	(id, owner_id, name, created, description, visits) VALUES
	-- A Helpful Hand
	(
		UUID '50773220-c023-11ec-bc87-43b3663f2319',
		UUID '00000000-0000-0000-0000-000000000000',
		'AHelpfulHand',
		TimestampTZ '2022-04-17T19:59:22.946Z',
		'Haul yourself up towering cliffs, now with friends!',
		62
	);

INSERT INTO subroom
	(room_id, subroom_name, public_version_timestamp, player_cap) VALUES
	(
		UUID '50773220-c023-11ec-bc87-43b3663f2319',
		'Level 1',
		TimestampTZ '2022-04-17T19:59:22.946Z',
		20
	),
	(
		UUID '50773220-c023-11ec-bc87-43b3663f2319',
		'Level 2',
		TimestampTZ '2022-04-17T19:59:22.946Z',
		20
	),
	(
		UUID '50773220-c023-11ec-bc87-43b3663f2319',
		'Level 3',
		TimestampTZ '2022-04-17T19:59:22.946Z',
		20
	);

INSERT INTO subroom_version
	(room_id, subroom_name, created, author_id, base_scene_name, summary) VALUES
	(
		UUID '50773220-c023-11ec-bc87-43b3663f2319',
		'Level 1',
		TimestampTZ '2022-04-17T19:59:22.946Z',
		UUID '00000000-0000-0000-0000-000000000000',
		'AHH_Level1',
		'Initial Commit',
	),
	(
		UUID '50773220-c023-11ec-bc87-43b3663f2319',
		'Level 2',
		TimestampTZ '2022-04-17T19:59:22.946Z',
		UUID '00000000-0000-0000-0000-000000000000',
		'AHH_Level2',
		'Initial Commit',
	),
	(
		UUID '50773220-c023-11ec-bc87-43b3663f2319',
		'Level 3',
		TimestampTZ '2022-04-17T19:59:22.946Z',
		UUID '00000000-0000-0000-0000-000000000000',
		'AHH_Level3',
		'Initial Commit',
	);

COMMIT;