require('dotenv').config();

const express = require('express');
const bcrypt = require('bcrypt');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fileUpload = require('express-fileupload');
const RateLimit = require('express-rate-limit');
const sanitize = require('sanitize-filename');

const APP = express();
APP.set('trust proxy', 1);

var limiter = RateLimit({
     windowMs: 1*60*1000,
     max: 100,
     standardHeaders: true,
     legacyHeaders: false
});

APP.use(limiter);

APP.use(express.json({
     limit: '50mb'
}));
APP.use(fileUpload({
     createParentPath: true,
     limit: '50mb'
}));

const config = require('./config.json');

const notificationTemplates = {
     invite: "invite",
     friendRequest: "friendRequest",
     messageRecieved: "messageRecieved"
}

//#region endpoints

//Server test call
APP.get("/", async (req, res) => {
     return res.status(200).send("Pong!");
});

//Check if a token is valid as developer.
APP.get("/api/dev/check", authenticateDeveloperToken, async (req, res) => {
     return res.status(200).send("This token is verified as Developer.");
});

//Joke
APP.get("/api/dingus", async(req, res) => {
     return res.status(200).send("You have ascended");
     //hmm
});

//Call to get the public account data of a user.
APP.get("/api/accounts/:id/public", async (req, res) => {
     const { id } = req.params;
     let id_clean = sanitize(id);

     if (fs.existsSync(`./data/accounts/${id_clean}.json`)) {
          const data = PullPlayerData(id_clean);
          return res.status(200).send(data.public);
     } else {
          return res.status(404).send(`Account with ID of ${id_clean} not found. Please check your request for errors.`);
     }
});

//(Authorized) Call to get the private account data of a user.
APP.get("/api/accounts/:id/private", authenticateToken, async(req, res) => {
     const { id } = req.params;
     let id_clean = sanitize(id);

     if(req.user.id !== id) return res.status(403).send("Token user does not have access to the specified user's private data!");

     if (fs.existsSync(`data/accounts/${id_clean}.json`)) {
          const data = PullPlayerData(id_clean);
          return res.status(200).send(data.private);
     } else {
          return res.status(404).send(`Account with ID of ${id} not found. Please check your request for typos.`);
     }
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


APP.get("/api/notifications/get/", authenticateToken, async (req, res) => {
     const id = req.user.id;

     const data = PullPlayerData(id);

     if(data.notifications == null) return res.status(200).send("[]");

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
     PushPlayerData(req.user.id, data);
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
     onPlayerReportedCallback(report);
});

APP.post("/img/upload/:others/:roomId/:roomName", authenticateToken, async (req, res) => {
     var timestamp = Date.now();
     var dir = fs.readdirSync("./data/images/");
     
     var {others, roomName, roomId} = req.params;

     if(!others) others = "[]";
     others = JSON.parse(others);

     if(!req.files)
          return res.status(400).send("Request does not contain any files.");
     
     if(!Array.isArray(req.files)) 
     {   
          return res.status(400).send("Failed to parse files.");
     }
     var filesSafe = Array.from(req.files);

     if(filesSafe.length > 1)
          return res.status(400).send("You can only upload one image at a time.");
     var file = filesSafe.img;

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
     let id_clean = sanitize(id);
     if(!fs.existsSync(`data/images/.${id_clean}`)) return res.status(404).send("Image with that ID does not exist.");
     res.status(200).send(fs.readFileSync(`data/images/.${id_clean}`));
});

APP.get("/img/:id", async (req, res) => {
     const {id} = req.params;
     let id_clean = sanitize(id);
     if(!fs.existsSync(`data/images/${id_clean}.png`)) return res.status(404).send("Image with that ID does not exist.");
     res.sendFile(`${__dirname}/data/images/${id_clean}.png`);
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
               filesArray.push(PullPlayerData(i));
          
          res.status(200).json(filesArray);
     } catch (exception) {
          console.error(exception);
          return res.sendStatus(500);
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

APP.post("/api/social/friend-request", authenticateToken, async (req, res) => {
     var {target} = req.body;
     target = target.toString();

     var sendingData = PullPlayerData(req.user.id);
     var recievingData = PullPlayerData(target);

     if(ArePlayersAnyFriendType(req.user.id, target)) return res.status(400).send("You are already friends with this player.");
     if(sendingData.private.friendRequestsSent.includes(target)) return res.status(400).send("You have already sent a friend request to this player, duplicate requests are not permitted.");

     NotifyPlayer(target, notificationTemplates.friendRequest, {
          "sendingPlayer": req.user.id,
          "headerText": `Friend Request`,
          "bodyText": `Hey there ${recievingData.public.nickname}! ${sendingData.public.nickname} has sent you a friend request! Press the "Profile" button to see their profile. Press "Accept" to become friends with them, or press "Ignore" to decline the request!`,
          "continueText": `Accept`,
          "cancelText": "Ignore"
     });

     res.status(200).send("Successfully sent friend request to player!");
     sendingData.private.friendRequestsSent.push(target);
     PushPlayerData(req.user.id, sendingData);
});

APP.post("/api/social/accept-request", authenticateToken, async (req, res) => {
     var {target} = req.body;
     target = target.toString();

     var recievingData = PullPlayerData(req.user.id);

     if(ArePlayersAnyFriendType(req.user.id, target)) return res.status(400).send("You are already friends with this player.")
     var filteredNotifications = recievingData.notifications.filter(item => item.template == notificationTemplates.friendRequest && item.parameters.sendingPlayer == target);
     
     if(filteredNotifications.length < 1) return res.status(400).send("You do not have any friend requests from this player. Ask them to send you one.");

     for (let index = 0; index < filteredNotifications.length; index++) {
          let itemIndex = recievingData.notifications.findIndex(item => item.template == notificationTemplates.friendRequest && item.parameters.sendingPlayer == target);
          recievingData.notifications.splice(itemIndex);
     }

     PushPlayerData(req.user.id, recievingData);

     AddAcquaintance(req.user.id, target, true);

     res.status(200).send("Successfully added acquaintance.");

     var sendingData = PullPlayerData(target);
     
     var index = sendingData.private.friendRequestsSent.findIndex(item => item == req.user.id);
     if(index >= 0) sendingData.private.friendRequestsSent.splice(index);
     PushPlayerData(target, sendingData);
});

APP.get("/api/social/sent-requests", authenticateToken, async (req, res) => {
     var data = PullPlayerData(req.user.id);
     res.status(200).json(data.private.friendRequestsSent);  
});

APP.post("/api/social/make-acquaintance", authenticateToken, async (req, res) => {
     var {target} = req.body;
     if(!target) return res.status(400).send("You did not specify a target!");
     target = target.toString();
     var sender = req.user.id;

     if(!ArePlayersAnyFriendType(sender, target)) return res.status(400).send("You are not acquaintances, friends, or favorite friends with this user.");

     RemoveFriend(sender, target, false);
     RemoveFavoriteFriend(sender, target, false);

     AddAcquaintance(sender, target, false);
     res.sendStatus(200);
});

APP.post("/api/social/make-friend", authenticateToken, async (req, res) => {
     var {target} = req.body;
     if(!target) return res.status(400).send("You did not specify a target!");
     target = target.toString();
     var sender = req.user.id;

     if(!ArePlayersAnyFriendType(sender, target)) return res.status(400).send("You are not acquaintances, friends, or favorite friends with this user.");

     RemoveAcquaintance(sender, target, false);
     RemoveFavoriteFriend(sender, target, false);

     AddFriend(sender, target, false);
     res.sendStatus(200);
});

APP.post("/api/social/make-favorite-friend", authenticateToken, async (req, res) => {
     var {target} = req.body;
     if(!target) return res.status(400).send("You did not specify a target!");
     target = target.toString();
     var sender = req.user.id;

     if(!ArePlayersAnyFriendType(sender, target)) return res.status(400).send("You are not acquaintances, friends, or favorite friends with this user.");

     RemoveAcquaintance(sender, target, false);
     RemoveFriend(sender, target, false);

     AddFavoriteFriend(sender, target, false);
     res.sendStatus(200);
});

APP.post("/api/social/remove-friend", authenticateToken, async (req, res) => {
     var {target} = req.body;
     if(!target) return res.status(400).send("You did not specify a target!");
     target = target.toString();
     var sender = req.user.id;

     if(!ArePlayersAnyFriendType(sender, target)) return res.status(400).send("You are not acquaintances, friends, or favorite friends with this user.");

     RemoveAcquaintance(sender, target, true);
     RemoveFriend(sender, target, true);
     RemoveFavoriteFriend(sender, target, true);
     res.sendStatus(200);
});

APP.post("/api/social/decline-request", authenticateToken, async (req, res) => {
     var {target} = req.body;
     if(!target) return res.status(400).send("You did not specify a target!");
     target = target.toString();
     const sender = req.user.id;

     if(ArePlayersAnyFriendType(sender, target)) return res.status(400).send("You are already acquaintances, friends, or favorite friends with this player!");

     var sendingData = PullPlayerData(target);
     if(sendingData == null) return res.status(404).send("That user does not exist!");

     var recievingData = PullPlayerData(sender);
     
     if(!sendingData.private.friendRequestsSent.includes(sender)) return res.status(400).send("You do not have a pending friend request from this player!");

     while(sendingData.private.friendRequestsSent.includes(sender)) {
          const index = sendingData.private.friendRequestsSent.findIndex(item => item == sender);
          sendingData.private.friendRequestsSent.splice(index);
     }
     PushPlayerData(target, sendingData);

     var temp = recievingData.notifications.filter(item => item.template == notificationTemplates.friendRequest && item.parameters.sendingPlayer == target);
     for (let index = 0; index < temp.length; index++) {
          let itemIndex = recievingData.notifications.findIndex(item => item.template == notificationTemplates.friendRequest && item.parameters.sendingPlayer == target);
          if(itemIndex >= 0) recievingData.notifications.splice(itemIndex);
          else break;
     }

     PushPlayerData(sender, recievingData);
     res.status(200).send("Declined friend request.");
});

APP.get("/api/social/acquaintances", authenticateToken, async (req, res) => {
     const data = PullPlayerData(req.user.id);
     var dictionary = {};
     for (let index = 0; index < data.private.acquaintances.length; index++) {
          const element = data.private.acquaintances[index];
          let player = PullPlayerData(element);
          dictionary[element] = player.public;
     }
     return res.status(200).json(dictionary);
});

APP.get("/api/social/friends", authenticateToken, async (req, res) => {
     const data = PullPlayerData(req.user.id);
     var dictionary = {};
     for (let index = 0; index < data.private.friends.length; index++) {
          const element = data.private.friends[index];
          let player = PullPlayerData(element);
          dictionary[element] = player.public;
     }
     return res.status(200).json(dictionary);
});

APP.get("/api/social/favorite-friends", authenticateToken, async (req, res) => {
     const data = PullPlayerData(req.user.id);
     var dictionary = {};
     for (let index = 0; index < data.private.favoriteFriends.length; index++) {
          const element = data.private.favoriteFriends[index];
          let player = PullPlayerData(element);
          dictionary[element] = player.public;
     }
     return res.status(200).json(dictionary);
});

APP.get("/api/social/all-friend-types", authenticateToken, async (req, res) => {
     const data = PullPlayerData(req.user.id);

     const array1 = MergeArraysWithoutDuplication(data.private.acquaintances, data.private.friends);
     const all = MergeArraysWithoutDuplication(array1, data.private.favoriteFriends);

     var dictionary = {};
     for (let index = 0; index < all.length; index++) {
          const element = all[index];
          let player = PullPlayerData(element);
          dictionary[element] = player.public;
     }
     return res.status(200).json(dictionary);
});

//#endregion


//#region analytics
APP.get("/api/analytics/accountCount", async (req, res) => {
     var files = fs.readdirSync("data/accounts");
     res.status(200).send(`${files.length - 1}`);
});
//#endregion

//#region Developer-only API calls

//Modify a user's currency balance.
APP.post("/api/accounts/:id/currency/modify", authenticateDeveloperToken, async (req, res) => {
     const { id } = req.params;
     let id_clean = sanitize(id);
     const { amount } = req.body;

     const exists = fs.existsSync(`./data/accounts/${id_clean}.json`);
     if(!exists) return res.status(404).send("User not found!");

     let data = PullPlayerData(id_clean);

     if(!(data.private.currency + amount >= 0)) return res.status(400).send("Final currency amount cannot be less than 0.");

     data.private.currency += amount;

     PushPlayerData(id_clean, data)

     auditLog(`!DEVELOPER ACTION! User ${req.user.username} with ID ${req.user.id} modified user ${id}'s currency balance by ${amount}, with a final balance of ${data.private.currency}.`);

     res.status(200).send("Action successful.");
});

//Set a user's currency balance.
APP.post("/api/accounts/:id/currency/set", authenticateDeveloperToken, async (req, res) => {
     const { id } = req.params;
     let id_clean = sanitize(id);
     const { amount } = req.body;

     const exists = fs.existsSync(`./data/accounts/${id_clean}.json`);
     if(!exists) return res.status(404).send("User not found!");

     let data = PullPlayerData(id_clean);

     if(amount < 0) return res.status(400).send("Final currency amount cannot be less than 0.");

     data.private.currency = amount;

     PushPlayerData(id_clean, data);

     auditLog(`!DEVELOPER ACTION! User ${req.user.username} with ID ${req.user.id} set user ${id}'s currency to ${amount}.`);

     res.status(200).send("Action successful.");
});

//Ban a user's account
APP.post("/api/accounts/:id/ban", authenticateDeveloperToken, async (req, res) => {
     const { id } = req.params;
     let id_clean = sanitize(id);
     const { reason, duration } = req.body;
     const moderator = req.user;

     BanPlayer(id, reason, duration);

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


//#endregion

//#region Functions

function getUserID(username) {
     const files = fs.readdirSync('./data/accounts/');

     var id = null;
     for (let index = 0; index < files.length; index++) {
          const element = files[index];
          
          const data = JSON.parse(fs.readFileSync(`./data/accounts/${element}`))

          const username2 = data.auth.username.toLowerCase();
          if(username2 == username.toLowerCase()) {
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
          let id_clean = sanitize(id.toString());
          var data = JSON.parse(fs.readFileSync(`./data/accounts/${id_clean}.json`));
          return data;
     } catch (exception) {
          console.error(exception);
          return null;
     }
}
function PushPlayerData(id, data) {
     data = JSON.stringify(data, null, "     ");
     let id_clean = sanitize(id.toString());
     fs.writeFileSync(`./data/accounts/${id_clean}.json`, data);
}

function NotifyPlayer(id, template, params) {
     if(!(Object.values(notificationTemplates).includes(template))) return false;
     var data = PullPlayerData(id);
     if(data == null) return false;

     const notification = {
          template: template,
          parameters: params
     }
     data.notifications.push(notification);

     PushPlayerData(id, data);
     return true;
}
function ArePlayersAnyFriendType(player1, player2) {
     var data = PullPlayerData(player1);
     return data.private.acquaintances.includes(player2.toString()) || 
          data.private.friends.includes(player2.toString()) || 
          data.private.favoriteFriends.includes(player2.toString());
}

function ArePlayersAcquantances(player1, player2) {
     var data = PullPlayerData(player1);
     return data.private.acquaintances.includes(player2.toString());
}

function ArePlayersFriends(player1, player2) {
     var data = PullPlayerData(player1);
     return data.private.friends.includes(player2.toString());
}

function ArePlayersFavoriteFriends(player1, player2) {
     var data = PullPlayerData(player1);
     return data.private.favoriteFriends.includes(player2.toString());
}

function RemoveAcquaintance(player1, player2, both) {
     var data1 = PullPlayerData(player1);
     var data2 = PullPlayerData(player2);

     var index1 = data1.private.acquaintances.findIndex(item => item == player2);
     if(index1 >= 0) data1.private.acquaintances.splice(index1);

     var index2 = data2.private.acquaintances.findIndex(item => item == player1);
     if(index2 >= 0 && both) data2.private.acquaintances.splice(index2);

     PushPlayerData(player1, data1);
     PushPlayerData(player2, data2);
}

function RemoveFriend(player1, player2, both) {
     var data1 = PullPlayerData(player1);
     var data2 = PullPlayerData(player2);

     var index1 = data1.private.friends.findIndex(item => item == player2);
     if(index1 >= 0) data1.private.friends.splice(index1);

     var index2 = data2.private.friends.findIndex(item => item == player1);
     if(index2 >= 0 && both) data2.private.friends.splice(index2);

     PushPlayerData(player1, data1);
     PushPlayerData(player2, data2);
}

function RemoveFavoriteFriend(player1, player2, both) {
     var data1 = PullPlayerData(player1);
     var data2 = PullPlayerData(player2);

     var index1 = data1.private.favoriteFriends.findIndex(item => item == player2);
     if(index1 >= 0) data1.private.favoriteFriends.splice(index1);

     var index2 = data2.private.favoriteFriends.findIndex(item => item == player1);
     if(index2 >= 0 && both) data2.private.favoriteFriends.splice(index2);

     PushPlayerData(player1, data1);
     PushPlayerData(player2, data2);
}

function AddAcquaintance(player1, player2, both) {
     var data1 = PullPlayerData(player1);
     var data2 = PullPlayerData(player2);

     if(!data1.private.acquaintances.includes(player2.toString())) 
     {
          data1.private.acquaintances.push(player2.toString());
          PushPlayerData(player1, data1);
     }
     if(!data2.private.acquaintances.includes(player1.toString()) && both) {
          data2.private.acquaintances.push(player1.toString());
          PushPlayerData(player2, data2);
     }
}

function AddFriend(player1, player2, both) {
     var data1 = PullPlayerData(player1);
     var data2 = PullPlayerData(player2);

     if(!data1.private.friends.includes(player2.toString())) 
     {
          data1.private.friends.push(player2.toString());
          PushPlayerData(player1, data1);
     }
     if(!data2.private.friends.includes(player1.toString()) && both) {
          data2.private.friends.push(player1.toString());
          PushPlayerData(player2, data2);
     }
}

function AddFavoriteFriend(player1, player2, both) {
     var data1 = PullPlayerData(player1);
     var data2 = PullPlayerData(player2);

     if(!data1.private.favoriteFriends.includes(player2.toString())) 
     {
          data1.private.favoriteFriends.push(player2.toString());
          PushPlayerData(player1, data1);
     }
     if(!data2.private.favoriteFriends.includes(player1.toString()) && both) {
          data2.private.favoriteFriends.push(player1.toString());
          PushPlayerData(player2, data2);
     }
}

function ClearPlayerNotification(id, IndexOrData) {
     var data = PullPlayerData(id);


     var mode = ( typeof(IndexOrData) == 'number' ) ? "id" : "data";

     if(mode == "id") {
          data.notifications = data.notifications.splice(IndexOrData);
     } else {
          if(data.notifications.includes(IndexOrData)) {
               while (data.notifications.includes(IndexOrData)) {
                    var index = data.notifications.findIndex(item => item == IndexOrData);
                    if(index > 0) data.notifications = data.notifications.splice(index);
                    else break;
               }
          }
     }

     PushPlayerData(id, data);
}
//#endregion

function MergeArraysWithoutDuplication(array1, array2) {
     return array1.concat(array2.filter((item) => array1.indexOf(item) < 0));
}

function onPlayerReportedCallback(reportData) {
     var reportedData = PullPlayerData(reportData.reportedUser);
     var reportingData = PullPlayerData(reportData.reportingUser);

     if(
          reportingData.private.availableTags.includes("Community Support") ||
          reportingData.private.availableTags.includes("Community Support Team") ||
          reportingData.private.availableTags.includes("Developer") ||
          reportingData.private.availableTags.includes("Moderator") ||
          reportingData.private.availableTags.includes("Founder")
     ) {
          BanPlayer(reportData.reportedUser, reportData.reason, 1, reportData.reportingUser);
          auditLog(`!! MODERATOR ACTION !!   Moderator ${reportingData.nickname} (@${reportingData.username}) reported user ${reportedData.nickname} (@${reportedData.username}) for the reason of ${reportData.reason}, resulting in them being automatically timed out for 1 hour.`);
     } else if (reportedData.auth.recievedReports.length >= config.timeout_at_report_count) {
          BanPlayer(reportData.reportedUser, `Automated timeout for recieving ${config.timeout_at_report_count} or more reports. This timeout will not affect your moderation history unless it is found to be 100% justified.`, 6, reportData.reportingUser);
          auditLog(`!! MODERATION ACTION !! User ${reportingData.nickname} (@${reportedData.username}) was timed out for 6 hours for recieving ${config.timeout_at_report_count} reports. Please investigate!`);
     }
}

function BanPlayer(id, reason, duration, moderator) {
     let id_clean = sanitize(id);
     let data = PullPlayerData(id_clean);

     const endTS = Date.now() + (duration * 1000 * 60) //convert duration from hours to a unix timestamp
     
     const ban = {
          reason: reason,
          endTS: endTS,
          moderator: moderator.id
     };

     data.auth.bans.push(ban);

     PushPlayerData(id_clean, data);
}
APP.listen(config.PORT, '0.0.0.0');
auditLog("Server Init");
console.log(`API is ready at http://localhost:${config.PORT}/ \n:D`);
