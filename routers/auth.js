const router = require('express').Router();
const helpers = require('../helpers');
const middleware = require('../middleware');
const fs = require('fs');
const BadWordList = JSON.parse(fs.readFileSync('../data/external/badwords-master/array.json'));
const sanitize = require('sanitize-filename');

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
     return res.status(200).json({ userID: userID, username: username, accessToken: accessToken});
});

//Call to create an account from a set of credentials.
router.post("/create", async (req, res) => {
     var { username, nickname, password } = req.body;
     const id = getAccountCount();

     if(username == null || password == null) return res.status(400).send("Username or password empty or null.")
     if(nickname == null) nickname = username;

     const check = helpers.getUserID(username);

     if(check != null) return res.status(400).send("Account already exists with that username. Please choose a different username.");

     const data = helpers.PullPlayerData("ACCT_TEMPLATE");

     data.public.nickname = nickname;
     data.public.username = username;

     data.private.inventory.clothes.shirts = [0, 1];
     data.private.inventory.clothes.hairStyles = [0, 1];
     data.private.inventory.clothes.hairColors = [0, 1, 2];

     data.auth.username = username;

     const salt = bcrypt.genSaltSync(10);

     const HASHED_PASSWORD = bcrypt.hashSync(password, salt);

     data.auth.HASHED_PASSWORD = HASHED_PASSWORD;
     data.auth.salt = salt;

     const final = data;

     fs.writeFileSync(`./data/accounts/${id}.json`, JSON.stringify(final, null, "    "));
     res.sendStatus(200);
});

app.post("/check", middleware.authenticateToken, async (req, res) => {
     return res.sendStatus(200);
});

module.exports = router;