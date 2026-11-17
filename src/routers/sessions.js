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
		const { username, password, two_factor_code } = req.body;

		// get account ID from username
		const userId = await helpers.getUserID(username);
		
		// verify account exists
		if (userId === null) {
			return res.status(404).json({
				code: "user_not_found",
				message: "There is no account with that username.",
			});
		}

		// read user data
		const data = await helpers.PullPlayerData(userId);

		// verify password
		const passwordMatches = bcrypt.compareSync(password, data.auth.HASHED_PASSWORD);
		if(!passwordMatches) {
			return res.status(403).send({
				code: "incorrect_password",
				message: "The password you have provided is incorrect.",
			});
		}

		// check for account bans
		for (let index = 0; index < data.auth.bans.length; index++) {
			const element = data.auth.bans[index];
			
			if(element.endTS > Date.now()) {
				return res.status(403).send({
					code: "user_banned",
					message: "You have been banned.", 
					data: {
						expires: element.endTS,
						reason: element.reason,
					}
				});
			}
		}

		// verify 2FA, if needed
		if (data.auth.mfa_enabled && data.auth.mfa_verified) {
			if(typeof two_factor_code != 'string') {
				return res.status(400).json({
					code: "missing_two_factor_code",
					message: "You have Two-Factor Authentication enabled on your account but you did not specify a valid code.",
				});
			}

			const verificationResult = await verify({
				secret: data.auth.mfa_secret,
				token: two_factor_code,
			});

			if (!verificationResult.valid) {
				return res.status(401).send({
					code: "invalid_two_factor_code",
					message: "You have provided an invalid two-factor authentication code.",
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
		const user = {username: username, id: userId, developer: developer};
		const accessToken = jwt.sign(user, helpers.config.authentication.token_secret, { expiresIn: "30m" });

		return res.status(200).json({
			code: "success",
			message: `Welcome back, ${data.public.nickname}!`,
			data: {
				sessionId: sessionId,
				expires: sessionExpiration,
				initialToken: accessToken,
				isDeveloper: developer,
				username: username,
			},
		});
	} catch (ex) {
		res.status(500).json({
			code: "internal_server_error",
			message: "An internal server error occurred while processing your request. Please try again later."
		});
		throw ex;
	}
});

module.exports = {
	router
};