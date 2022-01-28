require('dotenv').config();
const router = require('express').Router();
const helpers = require('../helpers');
const middleware = require('../middleware');
const fs = require('fs');
const BadWordList = JSON.parse(fs.readFileSync('./data/external/badwords-master/array.json'));
const sanitize = require('sanitize-filename');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = require('twilio')(accountSid, authToken);

router.post('/enable-2fa', middleware.authenticateToken, async (req, res) => {
     try {
          const data = helpers.PullPlayerData(req.user.id);
          if(data.auth.mfa_enabled) return res.status(400).send("Two factor authentication is already enabled on this account!");

          client.verify.services(process.env.TWILIO_SERVICE_SID)
                    .entities(`COMPENSATION-VR-ACCOUNT-ID-${req.user.id}`)
                    .newFactors
                    .create({
                         friendlyName: `${data.public.username}`,
                         factorType: 'totp'
                    })
                    .then(new_factor => {
                         res.status(200).send(new_factor.binding);
                         data.auth.mfa_enabled = true;
                         helpers.PushPlayerData(req.user.id, data);
                    });
     }
     catch (ex) {
          res.status(500).send("Failed to enable MFA.");
          throw ex;
     }
});

//Call to get a token from user account credentials.
router.post("/login", (req, res) => {
     //so first things first we need to check the username and password
     //and if those are correct we generate a token

     const { username, password } = req.body;
     const userID = helpers.getUserID(username);
     if(userID == null) return res.status(404).send("User not found!");

     //now we read the correct user file for the authorization data
     const data = helpers.PullPlayerData(userID);


     const { HASHED_PASSWORD, salt } = data.auth;

     const externalHashed = bcrypt.hashSync(password, salt);

     if(externalHashed !== HASHED_PASSWORD) return res.status(403).send("Incorrect password!");

     for (let index = 0; index < data.auth.bans.length; index++) {
          const element = data.auth.bans[index];
          
          if(element.endTS > Date.now()) return res.status(403).send({
               message: "USER IS BANNED", 
               endTimeStamp: element.endTS, 
               reason: element.reason
          });
     }
     
     //User is authenticated, generate and send token.

     const developer = data.private.availableTags.includes("Developer");

     const user = {username: username, id: userID, developer: developer};

     const accessToken = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "30m" });

     if(!data.auth.mfa_enabled) return res.status(200).json({ userID: userID, username: username, accessToken: accessToken});

     // client.verify.services(process.env.TWILIO_SERVICE_SID)
     //           .entities(`COMPENSATION-VR-ACCOUNT-ID-${userID}`)
     //           .factors
});

//Call to create an account from a set of credentials.
router.post("/create", async (req, res) => {
     var { username, nickname, password } = req.body;
     const id = helpers.getAccountCount();

     if(username == null || password == null) return res.status(400).send("Username or password empty or null.")
     if(nickname == null) nickname = username;

     const check = helpers.getUserID(username);

     if(check != null) return res.status(400).send("Account already exists with that username. Please choose a different username.");

     const data = helpers.PullPlayerData("ACCT_TEMPLATE");

     BadWordList.forEach(element => {
          if(username.toLowerCase().includes(element)) return res.status(400).send("Your username contains profanity or foul language. Change it to continue.");
          if(nickname.toLowerCase().includes(element)) return res.status(400).send("Your nickname contains profanity or foul language. Change it to continue.");
     });

     data.public.nickname = nickname;
     data.public.username = username;

     data.auth.username = username;

     const salt = bcrypt.genSaltSync(10);

     const HASHED_PASSWORD = bcrypt.hashSync(password, salt);

     data.auth.HASHED_PASSWORD = HASHED_PASSWORD;
     data.auth.salt = salt;

     fs.writeFileSync(`./data/accounts/${id}.json`, JSON.stringify(data, null, "    "));
     res.sendStatus(200);
});

router.post("/check", middleware.authenticateToken, async (req, res) => {
     return res.sendStatus(200);
});

module.exports = router;