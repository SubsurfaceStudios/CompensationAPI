require('dotenv').config();
const router = require('express').Router();
const helpers = require('../helpers');
const middleware = require('../middleware');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { PullPlayerData, check} = require('../helpers');
const config = require('../config.json');

const {default: rateLimit} = require('express-rate-limit');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = require('twilio')(accountSid, authToken);

// Users can now only create 1 account per day.
const accountCreationLimit = rateLimit({
    'windowMs': 86400000,
    'max': 1,
    'legacyHeaders': true,
    'standardHeaders': true
});

router.post('/enable-2fa', middleware.authenticateToken, async (req, res) => {
    try {
        const data = await helpers.PullPlayerData(req.user.id);
        if(data.auth.mfa_enabled || data.auth.mfa_enabled === "unverified") return res.status(400).send("Two factor authentication is already enabled on this account!");

        client.verify.services(process.env.TWILIO_SERVICE_SID)
            .entities(`COMPENSATION-VR-ACCOUNT-ID-${req.user.id}`)
            .newFactors
            .create({
                friendlyName: `${data.public.username}`,
                factorType: 'totp'
            })
            .then(async new_factor => {
                res.status(200).send(new_factor.binding);
                data.auth.mfa_enabled = "unverified";
                data.auth.mfa_factor_sid = new_factor.sid;
                await helpers.PushPlayerData(req.user.id, data);
            });
    }
    catch (ex) {
        res.status(500).send("Failed to enable MFA.");
        throw ex;
    }
});

router.post('/verify-2fa', middleware.authenticateToken, async (req, res) => {
    var {code} = req.body;
    if(typeof code != 'string') return res.status(400).send("Your 2FA code is undefined or is not a string. Check your Content-Type header and request body.");

    var _data = await PullPlayerData(req.user.id);
    if(_data.auth.mfa_enabled != 'unverified') return res.status(400).send("Your account is not currently awaiting verification.");

    Verify2faUser(req.user.id, code, async success => {
        if(success) {
            var data = await helpers.PullPlayerData(req.user.id);
            data.auth.mfa_enabled = true;
            await helpers.PushPlayerData(req.user.id, data);

            return res.sendStatus(200);
        }
        else return res.status(401).send("Failed to verify code. Please double check you entered a fully up to date token.");
    });
});

router.post('/remove-2fa', middleware.authenticateToken, async (req, res) => {
    var data = await PullPlayerData(req.user.id);

    if(!data.auth.mfa_enabled) return res.status(400).send("Your account does not have 2FA enabled or pending.");

    data.auth.mfa_enabled = false;
    data.auth.mfa_factor_sid = "undefined";

    await helpers.PushPlayerData(req.user.id, data);
    res.sendStatus(200);
});

//Call to get a token from user account credentials.
router.post("/login", async (req, res) => {
    //so first things first we need to check the username and password
    //and if those are correct we generate a token

    const { username, password, two_factor_code, hwid} = req.body;

    const userID = await helpers.getUserID(username);
    if(userID === null) return res.status(404).send({message: "User not found!", failureCode: "5"});

    //now we read the correct user file for the authorization data
    const data = await helpers.PullPlayerData(userID);


    const { HASHED_PASSWORD } = data.auth;

    const passwordMatches = bcrypt.compareSync(password, HASHED_PASSWORD);

    if(!passwordMatches) {
        if(typeof data.auth.logins != 'object') data.auth.logins = [];
        const attempt = {
            SUCCESS: false,
            IP: req.ip,
            TIME: Date.now(),
            HWID: hwid,
            TWO_FACTOR_CODE: two_factor_code
        };
        if(data.auth.logins.length < config.max_logged_logins) {
            data.auth.logins.push(attempt);
            await helpers.PushPlayerData(userID, data);
        }
        return res.status(403).send({message: "Incorrect password!", failureCode: "6"});
    }

    for (let index = 0; index < data.auth.bans.length; index++) {
        const element = data.auth.bans[index];
          
        if(element.endTS > Date.now()) {
            if(typeof data.auth.logins != 'object') data.auth.logins = [];
            const attempt = {
                SUCCESS: false,
                IP: req.ip,
                TIME: Date.now(),
                HWID: hwid,
                TWO_FACTOR_CODE: two_factor_code
            };
            if(data.auth.logins.length < config.max_logged_logins) {
                data.auth.logins.push(attempt);
                await helpers.PushPlayerData(userID, data);
            }
            return res.status(403).send({
                message: "USER IS BANNED", 
                endTimeStamp: element.endTS, 
                reason: element.reason,
                failureCode: "7"
            });
        }
    }
     
    //User is authenticated, generate and send token.

    const developer = data.private.availableTags.includes("Developer");

    const user = {username: username, id: userID, developer: developer};

    const accessToken = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "30m" });

    if(typeof data.auth.mfa_enabled == 'boolean' && !data.auth.mfa_enabled) {
        const attempt = {
            SUCCESS: true,
            IP: req.ip,
            TIME: Date.now(),
            HWID: hwid,
            TWO_FACTOR_CODE: two_factor_code
        };
        if(data.auth.logins.length < config.max_logged_logins) {
            data.auth.logins.push(attempt);
            await helpers.PushPlayerData(userID, data);
        }

        return res.status(200).json({ userID: userID, username: username, accessToken: accessToken, developer: developer});
    }

    if(typeof data.auth.mfa_enabled == 'string' && data.auth.mfa_enabled === 'unverified') {
        if(typeof data.auth.logins != 'object') data.auth.logins = [];
        const attempt = {
            SUCCESS: true,
            IP: req.ip,
            TIME: Date.now(),
            HWID: hwid,
            TWO_FACTOR_CODE: two_factor_code
        };
        if(data.auth.logins.length < config.max_logged_logins) {
            data.auth.logins.push(attempt);
            await helpers.PushPlayerData(userID, data);
        }
        if(developer) return res.status(200).json({ message: "As a developer, your account has a large amount of control and permissions.\nTherefore, it is very important you secure your account.\nPlease enable Two-Factor Authentication at your next convenience.", userID: userID, username: username, accessToken: accessToken, developer: developer});
        else return res.status(200).json({ userID: userID, username: username, accessToken: accessToken, developer: developer});
    }

    if(typeof two_factor_code != 'string') {
        if(typeof data.auth.logins != 'object') data.auth.logins = [];
        const attempt = {
            SUCCESS: false,
            IP: req.ip,
            TIME: Date.now(),
            HWID: hwid,
            TWO_FACTOR_CODE: two_factor_code
        };
        if(data.auth.logins.length < config.max_logged_logins) {
            data.auth.logins.push(attempt);
            await helpers.PushPlayerData(userID, data);
        }
        if(typeof hwid != 'string') return res.status(400).send({message: "You have 2FA enabled on your account but you did not specify a valid 2 Factor Authentication token.", failureCode: "1"});

        if(data.auth.multi_factor_authenticated_logins.length < 1) return res.status(400).send({message: "You have 2FA enabled on your account but you did not specify a valid 2 Factor Authentication token.", failureCode: "1"});

        const MatchingLogins = data.auth.multi_factor_authenticated_logins.filter(item => {
            // Return   IP match (include proxies)        HWID match    Less than 30 days since MFA login
            return item.ips === req.ips && item.hwid === hwid && Date.now() < item.timestamp + 2592000000;
        });


        if(MatchingLogins.length > 0) return res.status(200).json({ userID: userID, username: username, accessToken: accessToken, developer: developer});

        return res.status(400).send({message: "You have 2FA enabled on your account but you did not specify a valid 2 Factor Authentication token.", failureCode: "1"});
    }

    Verify2faCode(userID, two_factor_code, async status => {
        switch(status) {
        case 'approved':
            if(typeof hwid != 'string') return res.status(200).json({ userID: userID, username: username, accessToken: accessToken, developer: developer});
            var login = {
                ips: req.ips,
                hwid: hwid,
                timestamp: Date.now()
            };
            data.auth.multi_factor_authenticated_logins.push(login);
            await helpers.PushPlayerData(userID, data);
            return res.status(200).json({ userID: userID, username: username, accessToken: accessToken, developer: developer});
        case 'denied':
            return res.status(401).send({message: "2FA Denied.", failureCode: "2"});
        case 'expired':
            return res.status(401).send({message: "2FA Code Outdated", failureCode: "3"});
        case 'pending':
            return res.status(400).send({message: "2FA Denied.", failureCode: "4"});
        }
    });
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

    const user = {username: data.public.username, id: req.user.id, developer: developer};

    const accessToken = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "30m" });
    return res.status(200).json({ userID: req.user.id, username: data.public.username, accessToken: accessToken});
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

    if(check(nickname)) {
        helpers.auditLog(`Suspicious nickname on account creation: ${nickname} with ID ${id}. Request continued, please verify.`);
    }
    if(check(nickname)) {
        helpers.auditLog(`Suspicious username on account creation: ${username} with ID ${id}. Request continued, please verify.`);
    }
    

    data.public.nickname = nickname;
    data.public.username = username;

    data.auth.username = username;

    const HASHED_PASSWORD = bcrypt.hashSync(password, 10);

    data.auth.HASHED_PASSWORD = HASHED_PASSWORD;
    data._id = id;

    helpers.PushPlayerData(id, data);
    res.sendStatus(200);

    const client = require('../index').mongoClient;
    const db = client.db(process.env.MONGOOSE_DATABASE_NAME);
    const collection = db.collection("servers");

    var server = await collection.findOne({_id: {$eq: "a8ec2c20-a4c7-11ec-896d-419328454766", $exists: true}});
    if(server === null) return helpers.auditLog("The official server was not found. This is a critical error. How did you manage to fuck this up so badly?", false);

    server.users[id] = {};

    console.log(await collection.updateOne({_id: {$eq: "a8ec2c20-a4c7-11ec-896d-419328454766", $exists: true}}, {$set: {users: server.users}}, {upsert: true}));

    helpers.auditLog(`Created account ${username} with id ${id}.`, false);
});

router.post("/check", middleware.authenticateToken, async (req, res) => {
    return res.sendStatus(200);
});

router.get("/mfa-enabled", middleware.authenticateToken, async (req, res) => {
    const data = await helpers.PullPlayerData(req.user.id);
    return res.status(200).send(`${data.auth.mfa_enabled}`);
});

async function Verify2faUser(user_id, code, callback) {
    var data = await helpers.PullPlayerData(user_id);
    client.verify.services(process.env.TWILIO_SERVICE_SID)
        .entities(`COMPENSATION-VR-ACCOUNT-ID-${user_id}`)
        .factors(data.auth.mfa_factor_sid)
        .update({authPayload: code})
        .then(factor => {
            callback(factor.status === 'verified');
        });
}

async function Verify2faCode(user_id, code, callback) {
    var data = await helpers.PullPlayerData(user_id);
    client.verify.services(process.env.TWILIO_SERVICE_SID)
        .entities(`COMPENSATION-VR-ACCOUNT-ID-${user_id}`)
        .challenges
        .create({authPayload: code, factorSid: data.auth.mfa_factor_sid})
        .then(challenge => {
            callback(challenge.status);
            // challenge.status == 'approved';
            // challenge.status == 'denied';
            // challenge.status == 'expired';
            // challenge.status == 'pending';
        });
}

module.exports = router;
