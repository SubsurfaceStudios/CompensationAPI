const { randomBytes } = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const helpers = require('../helpers');

const db = require('../index').mongoClient.db(helpers.config.database.mongodb_database_name);
const router = require('express').Router();

const SESSION_DURATION_DAYS = Number(helpers.config.authentication?.session_duration) || 60;

// POST /api/sessions/
router.post('/', async (req, res) => {
	try {
		// read request body
		const { Username: username, Password: password, TwoFactorCode: two_factor_code } = req.body;

		// get account ID from username
		const userId = await helpers.getUserID(username);
		
		// verify account exists
		if (userId === null) {
			return res.status(404).json({
				Success: false,
				Error: {
					Code: "user_not_found",
					Message: "There is no account with that username.",
				}
			});
		}

		// read user data
		const data = await helpers.PullPlayerData(userId);

		// verify password
		const passwordMatches = bcrypt.compareSync(password, data.auth.HASHED_PASSWORD);
		if(!passwordMatches) {
			return res.status(403).send({
				Success: false,
				Error: {
					Code: "incorrect_password",
					Message: "The password you have provided is incorrect.",
				}
			});
		}

		// check for account bans
		for (let index = 0; index < data.auth.bans.length; index++) {
			const element = data.auth.bans[index];
			
			if(element.endTS > Date.now()) {
				return res.status(403).send({
					Success: false,
					Error: {
						Code: "user_banned",
						Message: "You have been banned.", 
					},
					Data: {
						Expires: element.endTS,
						Reason: element.reason,
					}
				});
			}
		}

		// verify 2FA, if needed
		if (data.auth.mfa_enabled && data.auth.mfa_verified) {
			if(typeof two_factor_code != 'string') {
				return res.status(400).json({
					Success: false,
					Error: {
						Code: "missing_two_factor_code",
						Message: "You have Two-Factor Authentication enabled on your account but you did not specify a valid code.",
					}
				});
			}

			const verificationResult = await verify({
				secret: data.auth.mfa_secret,
				token: two_factor_code,
			});

			if (!verificationResult.valid) {
				return res.status(401).send({
					Success: false,
					Error: {
						Code: "invalid_two_factor_code",
						Message: "You have provided an invalid two-factor authentication code.",
					}
				});
			}
		}

		// issue session
		const sessionExpiration = new Date();
		sessionExpiration.setDate(sessionExpiration.getDate() + SESSION_DURATION_DAYS);

		const sessionId = randomBytes(64).toString('base64url');
		
		await db.collection('sessions').insertOne({
			_id: sessionId,
			userId: userId,
			expires: sessionExpiration,
			userAgent: req.headers['user-agent'],
			ip: req.ip,
		});

		// issue initial access token
		const developer = data.private.availableTags.includes("Developer");
		const user = { username: username, id: userId, developer: developer };
		
		// 30 minutes, in seconds
		const tokenExpirationTime = 30 * 60;

		const accessToken = jwt.sign(user, helpers.config.authentication.token_secret, { expiresIn: `${tokenExpirationTime}s` });

		const pfp = await db.collection('images').findOne({
			_id: {
				$exists: true,
				$eq: data.public.profile_picture_id
			}
		});

		return res.status(200).json({
			Success: true,
			Data: {
				Player: {
					ID: userId,
					Username: username,
					Nickname: data.public.nickname,
					ProfilePictureID: pfp?._id,
					ProfilePictureURL: pfp?.blobUrl,
				},
				SpawnRoomID: "apartment", // FIXME this should correspond with a player's apartment ID on the new api
				Session: sessionId,
				Token: {
					Value: accessToken,
					ExpiresIn: 30 * 60, // 30 minutes * 60 seconds per minute
					ExpiresAt: (Date.now() / 1000) + tokenExpirationTime // the unix timestamp of when the token expires
				},
				IsAdmin: developer,
			},
		});
	} catch (ex) {
		res.status(500).json({
			Success: false,
			Error: {
				Code: "internal_server_error",
				Message: "An internal server error occurred while processing your request. Please try again later."
			}
		});
		throw ex;
	}
});

// POST /api/sessions/tokens - generate new access token from session
router.post('/tokens', async (req, res) => {
	try {
		// read request body
		const { SessionID: sessionId } = req.body;

		const session = await db.collection('sessions').findOne({
			_id: {
				$eq: sessionId,
				$exists: true,
			},
			expires: {
				$gt: new Date(),
			}
		});

		if (!session) {
			return res.status(404).json({
				Success: false,
				Error: {
					Code: "session_not_found",
					Message: "Unable to locate session. Has it been a long time since you last logged in? Try signing out and back in."
				}
			});
		}

		// Bump session expiry time whenever a new token is generated using it.
		const sessionExpiration = new Date();
		sessionExpiration.setDate(sessionExpiration.getDate() + SESSION_DURATION_DAYS);

		await db.collection('sessions').updateOne(
			{
				_id: {
					$eq: sessionId,
					$exists: true,
				},
			},
			{
				$set: {
					expires: sessionExpiration
				}
			}
		)

		// read user data
		const data = await helpers.PullPlayerData(session.userId);

		// check for account bans
		for (let index = 0; index < data.auth.bans.length; index++) {
			const element = data.auth.bans[index];
			
			if(element.endTS > Date.now()) {
				return res.status(403).send({
					Success: false,
					Error: {
						Code: "user_banned",
						Message: "You have been banned.", 
					},
					Data: {
						Expires: element.endTS,
						Reason: element.reason,
					}
				});
			}
		}

		// issue initial access token
		const developer = data.private.availableTags.includes("Developer");
		const user = { username: data.public.username, id: session.userId, developer: developer };
		
		// 30 minutes, in seconds
		const tokenExpirationTime = 30 * 60;

		const accessToken = jwt.sign(user, helpers.config.authentication.token_secret, { expiresIn: `${tokenExpirationTime}s` });

		const pfp = await db.collection('images').findOne({
			_id: {
				$exists: true,
				$eq: data.public.profile_picture_id
			}
		});

		return res.status(200).json({
			Success: true,
			Data: {
				Player: {
					ID: session.userId,
					Username: username,
					Nickname: data.public.nickname,
					ProfilePictureID: pfp?._id,
					ProfilePictureURL: pfp?.blobUrl,
				},
				SpawnRoomID: "apartment", // FIXME this should correspond with a player's apartment ID on the new api
				Token: {
					Value: accessToken,
					ExpiresIn: 30 * 60, // 30 minutes * 60 seconds per minute
					ExpiresAt: (Date.now() / 1000) + tokenExpirationTime // the unix timestamp of when the token expires
				},
				IsAdmin: developer,
			},
		});
	} catch (ex) {
		res.status(500).json({
			Success: false,
			Error: {
				Code: "internal_server_error",
				Message: "An internal server error occurred while processing your request. Please try again later."
			}
		});
		throw ex;
	}
});

module.exports = {
	router
};