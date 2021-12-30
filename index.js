require('dotenv').config();

const express = require('express');
const bcrypt = require('bcrypt');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fileUpload = require('express-fileupload');
const slowDown = require('express-slow-down');

const APP = express();
APP.enable('trust proxy');

const speedLimiter = slowDown({
     windowMs: 1000,
     delayAfter: 1,
     delayMs: 5000
});

APP.use(speedLimiter);

APP.use(express.json({
     limit: '50mb'
}));
APP.use(fileUpload({
     createParentPath: true,
     limit: '50mb'
}));

const config = require('./config.json');

//#region endpoints

//Server test call
APP.get("/", async (req, res) => {
     await res.status(200).send("Pong!");
});

//Check if a token is valid as developer.
APP.get("/api/dev/check", authenticateDeveloperToken, async (req, res) => {
     res.status(200).send("This token is verified as Developer.");
});

//Joke
APP.get("/api/dingus", async(req, res) => {
     await res.status(200).send("You have ascended");
     //hmm
});

//Call to get the public account data of a user.
APP.get("/api/accounts/:id/public", async (req, res) => {
     const { id } = req.params;
     fs.exists(`./data/accounts/${id}.json`, async (e) => {
          if (e) {
               const json = JSON.parse(fs.readFileSync(`./data/accounts/${id}.json`))
               const data = json; 
               res.status(200).send(data.public);
          } else {
               await res.status(404).send({ message: `Account with ID of ${id} not found. Please check your request for typos.` });
          }
     })
});

//(Authorized) Call to get the private account data of a user.
APP.get("/api/accounts/:id/private", authenticateToken, async(req, res) => {
     const { id } = req.params;
     if(req.user.id !== id) return res.status(403).send("Token user does not have access to the specified user's private data!");

     fs.exists(`./data/accounts/${id}.json`, async (e) => {
          if (e) {
               const json = JSON.parse(fs.readFileSync(`./data/accounts/${id}.json`))
               const data = json; 
               res.status(200).send(data.private);
          } else {
               await res.status(404).send({ message: `Account with ID of ${id} not found. Please check your request for typos.` });
          }
     })
})

//Call to get a token from user account credentials.
APP.post("/api/auth/login", (req, res) => {
     //so first things first we need to check the username and password
     //and if those are correct we generate a token

     const { username, password } = req.body;
     const userID = getUserID(username);
     if(userID == null) return res.status(404).send("User not found!");

     //now we read the correct user file for the authorization data
     const data = PullPlayerData(userID);


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
APP.post("/api/auth/create", async (req, res) => {
     var { username, nickname, password } = req.body;
     const id = getAccountCount();

     if(username == null || password == null) return res.status(400).send("Username or password empty or null.")
     if(nickname == null) nickname = username;

     const check = getUserID(username);

     if(check != null) return res.status(400).send("Account already exists with that username. Please choose a different username.");

     const data = PullPlayerData("ACCT_TEMPLATE");

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

     const user = {username: username, id: id};

     const final = data;

     fs.writeFileSync(`./data/accounts/${id}.json`, JSON.stringify(final, null, "    "));
     res.sendStatus(200);
});

APP.post("/api/auth/check", authenticateToken, async (req, res) => {
     return res.sendStatus(200);
});

//Call to get the first account with the specified username in the database, and return its ID.
APP.get("/api/accounts/:username/ID", async(req, res) => {
     const { username } = req.params;
     const id = getUserID(username)

     if(id == null) return res.status(404).send("User not present in database.");

     return res.status(200).send({ id: id, message: `User ${username} found in database with ID ${id}`});
});

//Get the global data associated with a KVP.
APP.get("/api/global/:key", async (req, res) => {
     const { key } = req.params;

     const global = await JSON.parse(fs.readFileSync("./data/global/global.json"));

     if(!(key in global)) return res.status(404).send("ID not in global title data.");

     res.status(200).send(global[key]);
});

//Post a notification to a user.
APP.post("/api/notifications/notify/:id", authenticateDeveloperToken, async (req, res) => {
    const { id } = req.params;
    var { title, description } = req.body;

    let data = await JSON.parse(fs.readFileSync(`./data/accounts/${id}.json`));

    var notif = {
          "type": "API Notification",
          "title": title,
          "description": description
    }

    data.notifications.push(notif);

    const final = JSON.stringify(data, null, "  ");
    fs.writeFileSync(`./data/accounts/${id}.json`, final);
    auditLog(`Notified user ${id}.`);
    res.sendStatus(200);
});

APP.get("/api/notifications/get/", authenticateToken, async (req, res) => {
     const id = req.user.id;

     const data = await JSON.parse(fs.readFileSync(`./data/accounts/${id}.json`));

     if(data.notifications == null) return res.status(200).send("User has no pending notifications.");

     res.status(200).json(data.notifications);
});

APP.post("/api/accounts/nickname", authenticateToken, async (req, res) => {
     const { nickname } = req.body;
     var data = await PullPlayerData(req.user.id);

     const BadWordList = await JSON.parse(fs.readFileSync("./data/external/badwords-master/array.json"));

     //Filter nickname
     BadWordList.forEach(element => {
          if(nickname.toLowerCase().contains(element)) return res.status(403).send("Your nickname contains profanity or inappropriate language. You must change it before you can continue.");
     });
     data.public.nickname = nickname;

     PushPlayerData(req.user.id, data);
     return res.sendStatus(200);
});

APP.post("/api/accounts/bio", authenticateToken, async (req, res) => {
     var { bio } = req.body;

     var data = await PullPlayerData(req.user.id);

     //check bio
     const BadWordList = await JSON.parse(fs.readFileSync("./data/external/badwords-master/array.json"));

     for (let index = 0; index < BadWordList.length; index++) {
          if(bio.toLowerCase().includes(BadWordList[index])) return res.status(403).send("Your bio contains profanity or inappropriate language. You must change it before you can continue.");
     }

     if(bio.length > 3000) return res.status(400).send("Bio is too long!");

     data.public.bio = bio;
     PushPlayerData(req.user.id, data);

     return res.sendStatus(200);
});

APP.post("/api/accounts/pronouns", authenticateToken, async (req, res) => {
     const {pronouns} = req.body;

     var data = await PullPlayerData(req.user.id);
     const array = ["He/Him", "She/Her", "They/Them", "He/they", "She/they", "He/she", "He/she/they", "Ask me"];

     data.public.pronouns = array[pronouns];
     PushPlayerData(req.body.id, data);
});

APP.post("/api/accounts/tag", authenticateToken, async (req, res) => {
     const {tag} = req.body;
     
     var data = await PullPlayerData(req.user.id);
     
     if(!data.private.availableTags.includes(tag)) return res.status(400).send("You do not have access to this tag!");

     data.public.tag = tag;

     PushPlayerData(req.user.id, data);

     res.sendStatus(200);
});

APP.post("/api/accounts/outfit", authenticateToken, async (req, res) => {
     var {type, id} = req.body;

     id = parseInt(id);

     var data = await PullPlayerData(req.user.id);

     if(!(type in data.private.inventory.clothes)) return res.status(400).send("Invalid clothing type.");

     if(!data.private.inventory.clothes[type].includes(id)) return res.status(400).send("You do not own this item.");

     data.public.outfit[type] = id;

     PushPlayerData(req.user.id, data);

     res.sendStatus(200);
});

APP.get("/api/catalog", async (req, res) => {
     try {
          const data = await fs.readFileSync("./data/catalog/catalog.json");
          return res.status(200).send(data);
     } catch {
          return res.sendStatus(500);
     }
});

APP.post("/api/accounts/report", authenticateToken, async (req, res) => {
     if(!(Object.keys(req.body).includes("target") && Object.keys(req.body).includes("reason"))) return res.status(400).send("Insufficient data sent!");
     const { target, reason } = req.body;

     var report = {
          timestamp: Date.now(),
          reportingUser: req.user.id,
          reportedUser: target,
          reason: reason
     }

     var reportingData = PullPlayerData(req.user.id);

     if(reportingData.auth.reportedUsers.includes(target)) return res.status(400).send("You have already reported this user!");
     if(req.user.id == target) return res.status(403).send("You cannot report yourself.");

     var data = PullPlayerData(target);

     data.auth.recievedReports.push(report);

     PushPlayerData(target, data);

     reportingData.auth.reportedUsers.push(target);

     PushPlayerData(req.user.id, reportingData);

     auditLog(`!MODERATION! User ${req.user.id} filed a report against user ${target} for the reason of ${reason}`);
     
     res.status(200).send("Report successfully applied. Thank you for helping keep Compensation VR safe.");
});

APP.post("/img/upload/:others/:roomId/:roomName", authenticateToken, async (req, res) => {
     var timestamp = Date.now();
     var dir = await fs.readdirSync("./data/images/");
     
     var {others, roomName, roomId} = req.params;

     if(!others) others = "[]";
     others = JSON.parse(others);

     if(!req.files)
          return res.status(400).send("Request does not contain any files.");
     if(req.files.length > 1)
          return res.status(400).send("You can only upload one image at a time.");
     var file = req.files.img;

     if(file.mimetype !== "image/png")
          return res.status(400).send("Sent file is not an image!");
          
     const filename = `${Math.floor(dir.length / 2) + 1}`;

     const authordata = PullPlayerData(req.user.id);

     var dotfiledata = {
          AuthorId: req.user.id,
          UploadTime: timestamp,
          TaggedPlayers: others,
          AuthorUsername: authordata.public.username,
          AuthorNickname: authordata.public.nickname,
          RoomName: roomName,
          RoomId: roomId,
          PhotoId: `${filename}`,
          UploadTimePrettyPrint: Date.now().toLocaleString(),
          privacy: 'public'
     };

     if(!fs.existsSync(`data/images/${filename}.png`)) {
          file.mv(`data/images/${filename}.png`);
          fs.writeFileSync(`data/images/.${filename}`, JSON.stringify(dotfiledata));
          return res.status(200).send();
     }
     res.sendStatus(500);
});

APP.get("/img/:id/info", async (req, res) => {
     const {id} = req.params;
     if(!fs.existsSync(`data/images/.${id}`)) return res.status(404).send("Image with that ID does not exist.");
     res.status(200).send(fs.readFileSync(`data/images/.${id}`));
});

APP.get("/img/:id", async (req, res) => {
     const {id} = req.params;
     if(!fs.existsSync(`data/images/${id}.png`)) return res.status(404).send("Image with that ID does not exist.");
     res.sendFile(`${__dirname}/data/images/${id}.png`);
})

APP.get("/api/social/imgfeed", async (req, res) => {
     try {
          var {count, offset, order} = req.body;
          if(typeof(count) == 'undefined' || typeof(offset) == 'undefined' || typeof(order) == 'undefined') return res.status(400).send("Insufficient data in request JSON body. Required parameters are 'count', 'offset', and 'order'.");

          var files = fs.readdirSync("data/images");
          if(files.length < 1) return res.status(400).send("No photos available.")
          files = files.filter((item => item.substring(0, 1) == '.'));
          if(order == 0)
               files = files.reverse();

          if(count > files.length - offset) count = files.length - offset;
          if(count < 1) count = 1;

          var filesArray = [];
          let i;
          for(i = offset + 1; i < count; i++)
               filesArray.push(JSON.parse(fs.readFileSync(`data/images/.${i}`)));
          
          res.status(200).json(filesArray);
     } catch (exception) {
          console.error(exception);
          return res.status(500).send(exception);
     }
     
});

APP.get("/api/social/takenby", async (req, res) => {
     var {user} = req.body;
     if(typeof(user) == 'undefined') return res.status(400).send("Request body does not contain the required parameter of 'user'");
     var dir = fs.readdirSync("data/images");

     if(dir.length < 1) return res.status(500).send("No images available on the API.");
     
     const playerdata = PullPlayerData(user);
     if(playerdata == null) return res.status(404).send("User does not exist!");

     dir = dir.filter((item => item.substring(0, 1) == '.'));
     dir = dir.map((item => JSON.parse(fs.readFileSync(`data/images/${item}`))));

     var playerTakenPhotos = dir.filter((item => item.AuthorId == user));
     
     if(playerTakenPhotos.length < 1) return res.status(404).send("Player has not taken or uploaded any photos.");

     return res.status(200).json(playerTakenPhotos);
});

APP.get("/api/social/takenwith", async (req, res) => {
     var {user} = req.body;
     if(typeof(user) == 'undefined') return res.status(400).send("Request body does not contain the required parameter of 'user'");
     var dir = fs.readdirSync("data/images");

     if(dir.length < 1) return res.status(500).send("No images available on the API.");
     
     const playerdata = PullPlayerData(user);
     if(playerdata == null) return res.status(404).send("User does not exist!");

     dir = dir.filter((item => item.substring(0, 1) == '.'));
     dir = dir.map((item => JSON.parse(fs.readFileSync(`data/images/${item}`))));

     var playerTaggedPhotos = dir.filter((item => item.TaggedPlayers.includes(user)));
     
     if(playerTaggedPhotos.length < 1) return res.status(404).send("Player has not been tagged in any photos.");

     return res.status(200).json(playerTaggedPhotos);
});

//#endregion

//#region Build download

APP.get("/src/:ver/PC", async (req, res) => {
     const { ver } = req.params;
     if(!fs.existsSync(`src/${ver}/PC/build.zip`)) return res.status(404).send("Build does not exist!");
     res.sendFile(`${__dirname}/src/${ver}/PC/build.zip`);
});

APP.get("/src/:ver/QUEST", async (req, res) => {
     const { ver } = req.params;
     if(!fs.existsSync(`src/${ver}/QUEST/build.apk`)) return res.status(404).send("Build does not exist!");
     res.sendFile(`${__dirname}/src/${ver}/QUEST/build.apk`);
});

APP.patch("/src/refresh", authenticateDeveloperToken, async (req, res) => {
     try {
          var files = fs.readdirSync("src");
          var versions = [];
          for (let index = 0; index < files.length; index++) {
               versions.push(files[index]);
          }
          fs.writeFileSync("data/catalog/version-cache.json", JSON.stringify(versions, null, "     "));
     }
     catch (exception) {
          console.log(exception);
          return res.status(500).send("Failed to refresh version cache. Check serverside.");
     }
     return res.status(200).send("Successfully refreshed version cache.");
});

APP.get("/src/versions", async (req, res) => {
     res.status(200).send(fs.readFileSync("data/catalog/version-cache.json"));
});

APP.post("/src/:ver/PC/upload", authenticateDeveloperToken, async (req, res) => {
     if(!req.files) return res.status(400).send("You did not include a binary file with your request.");
     let file = req.files.build;

     const {ver} = req.params;
     
     if(!fs.existsSync(`src/${ver}`)) fs.mkdirSync(`src/${ver}`);
     if(!fs.existsSync(`src/${ver}/PC`)) fs.mkdirSync(`src/${ver}/PC`);

     file.mv(`src/${ver}/PC/${file.name}`);

     res.send({
          status: 200,
          message: 'File is uploaded',
          data: {
              name: file.name,
              mimetype: file.mimetype,
              size: file.size
          }
     });
});

APP.post("/src/:ver/QUEST/upload", authenticateDeveloperToken, async (req, res) => {
     if(!req.files) return res.status(400).send("You did not include a binary file with your request.");
     let file = req.files.build;

     const {ver} = req.params;
     
     if(!fs.existsSync(`src/${ver}`)) fs.mkdirSync(`src/${ver}`);
     if(!fs.existsSync(`src/${ver}/QUEST`)) fs.mkdirSync(`src/${ver}/QUEST`);

     file.mv(`src/${ver}/QUEST/${file.name}`);

     res.send({
          status: 200,
          message: 'File is uploaded',
          data: {
              name: file.name,
              mimetype: file.mimetype,
              size: file.size
          }
     });
});

APP.get("/api/analytics/accountCount", async (req, res) => {
     var files = fs.readdirSync("data/accounts");
     res.status(200).send(files.length - 1);
});
//#endregion

//#region Developer-only API calls

//Modify a user's currency balance.
APP.post("/api/accounts/:id/currency/modify", authenticateDeveloperToken, async (req, res) => {
     const { id } = req.params;
     const { amount } = req.body;

     const exists = fs.existsSync(`./data/accounts/${id}.json`);
     if(!exists) return res.status(404).send("User not found!");

     let data = JSON.parse(fs.readFileSync(`./data/accounts/${id}.json`));

     if(!(data.private.currency + amount >= 0)) return res.status(400).send("Final currency amount cannot be less than 0.");

     data.private.currency += amount;

     fs.writeFileSync(`./data/accounts/${id}.json`, JSON.stringify(data, null, "     "));

     auditLog(`!DEVELOPER ACTION! User ${req.user.username} with ID ${req.user.id} modified user ${id}'s currency balance by ${amount}, with a final balance of ${data.private.currency}.`);

     res.status(200).send("Action successful.");
});

//Set a user's currency balance.
APP.post("/api/accounts/:id/currency/set", authenticateDeveloperToken, async (req, res) => {
     const { id } = req.params;
     const { amount } = req.body;

     const exists = fs.existsSync(`./data/accounts/${id}.json`);
     if(!exists) return res.status(404).send("User not found!");

     let data = JSON.parse(fs.readFileSync(`./data/accounts/${id}.json`));

     if(amount < 0) return res.status(400).send("Final currency amount cannot be less than 0.");

     data.private.currency = amount;

     fs.writeFileSync(`./data/accounts/${id}.json`, JSON.stringify(data, null, "     "));

     auditLog(`!DEVELOPER ACTION! User ${req.user.username} with ID ${req.user.id} set user ${id}'s currency to ${amount}.`);

     res.status(200).send("Action successful.");
});

//Ban a user's account
APP.post("/api/accounts/:id/ban", authenticateDeveloperToken, async (req, res) => {
     const { id } = req.params;
     const { reason, duration } = req.body;
     const moderator = req.user;

     let data = PullPlayerData(id);

     const endTS = Date.now() + (duration * 1000 * 60) //convert duration from hours to a unix timestamp
     
     const ban = {
          reason: reason,
          endTS: endTS,
          moderator: moderator.id
     };

     await data.auth.bans.push(ban);

     fs.writeFileSync(`./data/accounts/${id}.json`, JSON.stringify(data, null, "    "));

     auditLog(`!DEVELOPER ACTION! User ${id} was banned for ${duration} hours by moderator ${moderator.username}.`)
     res.status(200).send();
});

APP.post("/api/global/:key", authenticateDeveloperToken, async (req, res) => {
     const { key } = req.params;
     const { value } = req.body;

     var global = await JSON.parse(fs.readFileSync("./data/global/global.json"));

     global[key] = value;

     fs.writeFileSync("./data/global/global.json", JSON.stringify(global, null, "    "));
     auditLog(`!DEVELOPER ACTION! Developer ${req.user.username} with ID ${req.user.id} updated GLOBAL title data with key ${key}.`);
     res.status(200).send();
});

APP.patch("/api/dev/REGEN_SECRETS", authenticateDeveloperToken, async(req, res) => {
     const ACCESS_TOKEN_SECRET = crypto.randomBytes(64).toString('hex');

     process.env.ACCESS_TOKEN_SECRET = ACCESS_TOKEN_SECRET;

     auditLog(`!CRITICAL DEVELOPER ACTION! DEVELOPER \"${req.user.username}\" HAS REGENRATED ALL TOKEN SECRETS! ANY CURRENTLY ACTIVE TOKENS ARE NOW INVALID!`);
});


//#endregion

//#region Functions

function getUserID(username) {
     const files = fs.readdirSync('./data/accounts/');

     var id = null;
     for (let index = 0; index < files.length; index++) {
          const element = files[index];
          
          const data = JSON.parse(fs.readFileSync(`./data/accounts/${element}`))

          const username2 = data.auth.username;
          if(username2 == username) {
               id = element.split(".")[0];
               break; 
          }
     }
     return id;
}

function getAccountCount() {
     const files = fs.readdirSync('./data/accounts/');
     return files.length - 1;
}

function authenticateToken(req, res, next) {
     const authHeader = req.headers['authorization'];
     const token = authHeader && authHeader.split(" ")[1];

     if(token == null) return res.sendStatus(401);

     //then we need to authenticate that token in this middleware and return a user
     try
     {
          const tokenData = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
          req.user = tokenData;

          const data = PullPlayerData(tokenData.id);

          for (let index = 0; index < data.auth.bans.length; index++) {
               const element = data.auth.bans[index];
               
               if(element.endTS > Date.now()) return res.status(403).send({
                    message: "USER IS BANNED", 
                    endTimeStamp: element.endTS, 
                    reason: element.reason
               });
          }
          next();
     }
     catch
     {
          return res.status(403).send("Invalid or expired authorization token.")
     }
}

function authenticateDeveloperToken(req, res, next) {
     const authHeader = req.headers['authorization'];
     const token = authHeader && authHeader.split(" ")[1];

     if(token == null) return res.sendStatus(401);

     //then we need to authenticate that token in this middleware and return a user
     try
     {
          const tokenData = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
          req.user = tokenData;

          const data = PullPlayerData(tokenData.id);

          for (let index = 0; index < data.auth.bans.length; index++) {
               const element = auth.bans[index];
               
               if(element.endTS > Date.now()) return res.status(403).send({
                    message: "USER IS BANNED", 
                    endTimeStamp: element.endTS, 
                    reason: element.reason
               });
               console.log(element);
          }

          if(!tokenData.developer) return res.status(403).send("Provided token is not owned by a developer!");

          next();
     }
     catch
     {
          return res.status(403).send("Invalid or expired authorization token.")
     }
}

function auditLog(message) {
     const file = fs.readFileSync("./data/audit.json");
     let data = JSON.parse(file);

     const ts = Date.now();

     const log = `${ts} - ${message}`;

     data.push(log);
     const final = JSON.stringify(data, null, "   ");
     fs.writeFileSync("./data/audit.json", final);
}
//#endregion

//#region Helper Functions
function PullPlayerData(id) {
     try {
          var data = JSON.parse(fs.readFileSync(`./data/accounts/${id}.json`));
          return data;
     } catch (exception) {
          console.error(exception);
          return null;
     }
}
function PushPlayerData(id, data) {
     data = JSON.stringify(data, null, "     ");
     fs.writeFileSync(`./data/accounts/${id}.json`, data);
}
//#endregion

APP.listen(config.PORT, '0.0.0.0');
auditLog("Server Init");
console.log(`API is ready at http://localhost:${config.PORT}/ \n:D`);
