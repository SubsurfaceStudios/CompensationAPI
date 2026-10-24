BEGIN DEFERRABLE;

INSERT INTO player
	(id, username, created, password_hash, nickname, tag, pronouns, bio) VALUES
	(
		UUID '00000000-0000-0000-0000-000000000000',
		'system',
		TimestampTZ '2021-02-11T16:36:17.134Z',
		'XXX',
		'CVR',
		'Official',
		'It / Its',
		'This is the official account of Compensation VR!'
	)
	ON CONFLICT DO NOTHING;

COMMIT;