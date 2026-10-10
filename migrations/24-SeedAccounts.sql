BEGIN DEFERRABLE;
SET CONSTRAINTS ALL DEFERRED;

INSERT INTO player
	(id, username, created, password_hash, nickname, pronouns, bio, current_outfit) VALUES
	(
		UUID '00000000-0000-0000-0000-000000000000',
		'system',
		TimestampTZ '2021-02-11T16:36:17.134Z',
		'XXX',
		'CVR',
		'It / Its',
		'This is the official account of Compensation VR!',
		UUID '00000000-0000-0000-0000-000000000000'
	)
	ON CONFLICT DO NOTHING;

INSERT INTO player_outfit
	(id, owner) VALUES
	(
		UUID '00000000-0000-0000-0000-000000000000',
		UUID '00000000-0000-0000-0000-000000000000'
	);

COMMIT;