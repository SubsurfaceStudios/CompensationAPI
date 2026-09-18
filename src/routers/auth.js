const router = require('express').Router();
const middleware = require('../middleware');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const helpers = require('../helpers');
const { PullPlayerData, PushPlayerData, config } = helpers;
const { default: rateLimit } = require('express-rate-limit');

const { generateSecret, verify, generateURI } = require('otplib');

// Users can now only create 1 account per day.
const accountCreationLimit = rateLimit({
    'windowMs': 86400000,
    'max': 1,
    'legacyHeaders': true,
    'standardHeaders': true
});

router.get('/photon-info', async (req, res) => {
    try {
        const coll = require('../index').mongoClient.db(config.database.mongodb_database_name).collection("configuration");

        const data = await coll.findOne(
            {
                _id: { $exists: true, $eq: "PhotonData" }
            }
        );

        if (!data) return res.status(500).json({
            code: "internal_error",
            message: "This server is misconfigured and cannot serve your request."
        });

        return res.status(200).send(
            data.data
        );
    } catch (ex) {
        res.status(500).json({
            code: "internal_error",
            message: "An internal server error occurred and we could not serve your request."
        });
    }
});

router.post('/enable-2fa', middleware.authenticateToken, async (req, res) => {
    try {
        const data = await helpers.PullPlayerData(req.user.id);
        if(data.auth.mfa_enabled) return res.status(400).send("Two factor authentication is already enabled on this account!");

        const secret = generateSecret();
        const uri = generateURI({
            issuer: "Compensation VR",
            label: req.user.username,
            secret
        });
        
        data.auth.mfa_enabled = true;
        data.auth.mfa_verified = false;
        data.auth.mfa_secret = secret;
        await helpers.PushPlayerData(req.user.id, data);
        
        res.status(200).json({
            code: "success",
            message: "Successfully enabled 2FA. Use /api/auth/verify-2fa to ensure it is actually required on login.",
            secret,
            uri,
        });
    }
    catch (ex) {
        res.status(500).send("Failed to enable MFA.");
        throw ex;
    }
});

router.post('/verify-2fa', middleware.authenticateToken, async (req, res) => {
    var { code } = req.body;
    if(typeof code != 'string') return res.status(400).send("Your 2FA code is undefined or is not a string. Check your Content-Type header and request body.");

    var data = await PullPlayerData(req.user.id);
    if(!data.auth.mfa_enabled || data.auth.mfa_verified) return res.status(400).send("Your account is not currently awaiting verification.");

    data.auth.mfa_verified = true;

    await helpers.PushPlayerData(req.user.id, data);

    return res.status(200).json({
        code: "success",
        message: "Successfully verified 2FA code. A TOTP code will now be required on every login attempt."
    });
});

router.post('/remove-2fa', middleware.authenticateToken, async (req, res) => {
    var data = await PullPlayerData(req.user.id);

    if(!data.auth.mfa_enabled) return res.status(400).send("Your account does not have 2FA enabled or pending.");

    data.auth.mfa_enabled = false;
    data.auth.mfa_verified = false;
    data.auth.mfa_secret = null;

    await helpers.PushPlayerData(req.user.id, data);
    res.sendStatus(200);
});

//Call to get a token from user account credentials.
router.post("/login", async (req, res) => {
    //so first things first we need to check the username and password
    //and if those are correct we generate a token

    const { username, password, two_factor_code } = req.body;

    const userID = await helpers.getUserID(username);
    if (userID === null) {
        return res.status(404).json({
            code: "no_user_found",
            message: "There is no registered CVR user with that username.",
            // for backwards compat
            failureCode: "5"
        });
    }

    //now we read the correct user file for the authorization data
    const data = await helpers.PullPlayerData(userID);


    const { HASHED_PASSWORD } = data.auth;

    const passwordMatches = bcrypt.compareSync(password, HASHED_PASSWORD);

    if(!passwordMatches) {
        return res.status(403).send({
            code: "incorrect_password",
            message: "The password you have provided is incorrect.",
            // included for backwards compat
            failureCode: "6"
        });
    }

    for (let index = 0; index < data.auth.bans.length; index++) {
        const element = data.auth.bans[index];
          
        if(element.endTS > Date.now()) {
            return res.status(403).send({
                code: "user_banned",
                message: "The account you are trying to log into has been banned from Compensation VR.", 
                endTimeStamp: element.endTS, 
                reason: element.reason,
                // included for backwards compat
                failureCode: "7"
            });
        }
    }
     
    //User is authenticated, generate and send token.

    const developer = data.private.availableTags.includes("Developer");

    const user = {username: username, id: userID, developer: developer};

    const accessToken = jwt.sign(user, config.authentication.token_secret, { expiresIn: "30m" });

    if(!data.auth.mfa_enabled) {
        return res.status(200).json({
            code: "success",
            message: "Successfully logged in. Welcome back.",

            userID,
            username,
            accessToken,
            developer
        });
    }

    if (data.auth.mfa_enabled && !data.auth.mfa_verified) {
        return res.status(200).json({
            code: "success",
            message: "Successfully logged in. Welcome back.",

            userID,
            username,
            accessToken,
            developer,
        });
    }

    if(typeof two_factor_code != 'string') {
        return res.status(400).json({
            code: "missing_two_factor_code",
            message: "You have 2FA enabled on your account but you did not specify a valid 2 Factor Authentication token.",
            // included for backwards compatibility, will be removed in v2
            failureCode: "1"
        });
    }

    const verificationResult = await verify({
        secret: data.auth.mfa_secret,
        token: two_factor_code,
    });

    if (verificationResult.valid) {
        return res.status(200).json({
            code: "success",
            message: "Successfully logged in. Welcome back.",

            userID,
            username,
            accessToken,
            developer
        });
    } else {
        return res.status(401).send({
            code: "invalid_two_factor_code",
            message: "You have provided an invalid two-factor authentication code.",
            // included for backwards compat
            failureCode: "2"
        });
    }
});

router.post("/refresh", middleware.authenticateToken, async (req, res) => {
    const data = await helpers.PullPlayerData(req.user.id);

    for (let index = 0; index < data.auth.bans.length; index++) {
        const element = data.auth.bans[index];
          
        if(element.endTS > Date.now()) return res.status(403).send({
            message: "USER IS BANNED", 
            endTimeStamp: element.endTS, 
            reason: element.reason,
            failureCode: "7"
        });
    }

    const developer = data.private.availableTags.includes("Developer");

    const user = {username: data.public.username, id: req.user.id, developer};

    const accessToken = jwt.sign(user, config.authentication.token_secret, { expiresIn: "30m" });
    return res.status(200).json({ userID: req.user.id, username: data.public.username, accessToken: accessToken, developer });
});

//Call to create an account from a set of credentials.
router.post("/create", accountCreationLimit, async (req, res) => {
    var { username, nickname, password } = req.body;
    const id = `${await helpers.getAccountCount() + 1}`;

    if(typeof username != 'string' || typeof password != 'string') return res.status(400).send("Username or password empty or null.");
    if(typeof nickname != 'string') nickname = username;

    const dupe = await helpers.getUserID(username);

    if(dupe !== null) return res.status(400).send("Account already exists with that username. Please choose a different username.");

    const data = await helpers.PullPlayerData("ACCT_TEMPLATE");
    

    data.public.nickname = nickname;
    data.public.username = username;

    const HASHED_PASSWORD = bcrypt.hashSync(password, 10);

    data.auth.HASHED_PASSWORD = HASHED_PASSWORD;
    data._id = id;

    helpers.PushPlayerData(id, data);
    res.sendStatus(200);

    const client = require('../index').mongoClient;
    const db = client.db(config.database.mongodb_database_name);
    const collection = db.collection("servers");

    var server = await collection.findOne({_id: {$eq: "a8ec2c20-a4c7-11ec-896d-419328454766", $exists: true}});
    if(server === null) return helpers.auditLog("The official server was not found. This is a critical error.", false);

    server.users[id] = {};

    console.log(await collection.updateOne({_id: {$eq: "a8ec2c20-a4c7-11ec-896d-419328454766", $exists: true}}, {$set: {users: server.users}}, {upsert: true}));

    helpers.auditLog(`Created account ${username} with id ${id}.`, false);
});

router.post("/check", middleware.authenticateToken, async (req, res) => {
    return res.sendStatus(200);
});

router.get("/mfa-enabled", middleware.authenticateToken, async (req, res) => {
    const data = await helpers.PullPlayerData(req.user.id);

    // unfortunately this is necessary for backwards compat
    // this should probably be refactored in a v2 (maybe just a json blurb with a few fields) somehow
    if (!data.auth.mfa_enabled) {
        return res.status(200).send("false");
    } else {
        return res.status(200).send(data.auth.mfa_verified ? "true" : "unverified");
    }
});

router.get("/password-update", middleware.authenticateDeveloperToken, async (req, res) => {
    try {
        const { current_password, new_password } = req.body;

        if(typeof current_password == 'undefined' || typeof new_password == 'undefined')
            return res.status(400).json({
                code: "missing_parameter",
                message: "You did not specify either your current password or your new password."
            });

        if(current_password == new_password) 
            return res.status(400).json({
                code: "invalid_parameter",
                message: "Your new password cannot be the same as your old password."
            });

        if(new_password.length < 8)
            return res.status(400).json({
                code: "invalid_password",
                message: "Your new password is too short."
            });

        let data = await PullPlayerData(req.user.id);
        if(data.auth.mfa_enabled) 
            return res.status(400).json({
                code: "access_denied",
                message: "The password of accounts with Multi-Factor Authentication cannot be changed. Support will not be able to assist you.\nStaff may be able to recieve exemptions, if you are a staff member locked out of your account please contact the development team directly."
            });

        if(!bcrypt.compareSync(current_password, data.auth.HASHED_PASSWORD))
            return res.status(401).json({
                code: "incorrect_password",
                message: "Your current password input is incorrect. Please resolve this to continue the password reset process, or contact support."
            });
        
        data.auth.HASHED_PASSWORD = bcrypt.hashSync(new_password, 10);

        await PushPlayerData(req.user.id, data);

        return res.status(200).json({
            code: "success",
            message: "The operation was completed successfully."
        });
    } catch (ex) {
        res.status(500).json({
            code: "internal_server_error",
            message: "A critical internal error occurred and we could not process your request."
        });
        throw ex;
    }
});

module.exports = router;
