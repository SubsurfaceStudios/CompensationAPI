const router = require('express').Router();
const helpers = require('../helpers');
const middleware = require('../middleware');
const fs = require('fs');
const BadWordList = require('../data/badwords/array');
const sanitize = require('sanitize-filename');
const { authenticateDeveloperToken } = require('../middleware');
const { PullPlayerData, PushPlayerData } = require('../helpers');
const express = require('express');
const Fuse = require('fuse.js');

router.use(express.urlencoded({extended: false}));

//Call to get the public account data of a user.
router.get("/:id/public", async (req, res) => {
     const { id } = req.params;
     let id_clean = sanitize(id);
     
     let data = await helpers.PullPlayerData(id_clean);
     if (data != null) {
          return res.status(200).send(data.public);
     } else {
          return res.status(404).send(`Account with ID of ${id_clean} not found. Please check your request for errors.`);
     }
});

//(Authorized) Call to get the private account data of a user.
router.get("/:id/private", middleware.authenticateToken, async (req, res) => {
     const { id } = req.params;
     let id_clean = sanitize(id);

     if(req.user.id !== id) return res.status(403).send("Token user does not have access to the specified user's private data!");

     if (fs.existsSync(`data/accounts/${id_clean}.json`)) {
          const data = await helpers.PullPlayerData(id_clean);
          return res.status(200).send(data.private);
     } else {
          return res.status(404).send(`Account with ID of ${id} not found. Please check your request for typos.`);
     }
});

//Call to get the first account with the specified username in the database, and return its ID.
router.get("/:username/ID", async (req, res) => {
     const { username } = req.params;
     const id = await helpers.getUserID(username);

     if(id == null) return res.status(404).send("User not present in database.");

     return res.status(200).send({ id: id, message: `User ${username} found in database with ID ${id}`});
});

router.get("/:id/edit", authenticateDeveloperToken, async (req, res) => {
     var {id} = req.params;
     id = sanitize(id);

     var data = await PullPlayerData(id);
     if(data == null) return res.status(404).send("Account not found.");
     else return res.status(200).json(data);
});

router.post("/:id/edit", authenticateDeveloperToken, async (req, res) => {
     var {id} = req.params;
     id = sanitize(id);

     try {
          await PushPlayerData(id, req.body);
          res.status(200).send();
     } catch {
          res.status(500).send();
     }
});

router.post("/nickname", middleware.authenticateToken, async (req, res) => {
     const { nickname } = req.body;
     var data = await helpers.PullPlayerData(req.user.id);

     //Filter nickname
     BadWordList.forEach(element => {
          if(nickname.toLowerCase().includes(element)) return res.status(403).send("Your nickname contains profanity or inappropriate language. You must change it before you can continue.");
     });
     data.public.nickname = nickname;

     await helpers.PushPlayerData(req.user.id, data);

     helpers.auditLog(`${req.user.id} changed their nickname to ${nickname}`, false);
     return res.sendStatus(200);
});

router.post("/bio", middleware.authenticateToken, async (req, res) => {
     var { bio } = req.body;

     var data = await helpers.PullPlayerData(req.user.id);

     for (let index = 0; index < BadWordList.length; index++) {
          if(bio.toLowerCase().includes(BadWordList[index])) return res.status(403).send("Your bio contains profanity or inappropriate language. You must change it before you can continue.");
     }

     if(bio.length > 3000) return res.status(400).send("Bio is too long!");

     data.public.bio = bio;
     await helpers.PushPlayerData(req.user.id, data);

     helpers.auditLog(`${req.user.id} changed their bio to ${bio}`, false);

     return res.sendStatus(200);
});

router.post("/tag", middleware.authenticateToken, async (req, res) => {
     const {tag} = req.body;
     
     var data = await helpers.PullPlayerData(req.user.id);
     
     if(!data.private.availableTags.includes(tag)) return res.status(400).send("You do not have access to this tag!");

     data.public.tag = tag;

     await helpers.PushPlayerData(req.user.id, data);

     res.sendStatus(200);
});

router.post("/pronouns", middleware.authenticateToken, async (req, res) => {
     const {pronouns} = req.body;
     if(!pronouns) return res.status(400).send("You did not specify a pronoun to use.");

     var data = await helpers.PullPlayerData(req.user.id);
     const array = ["He/Him", "She/Her", "They/Them", "He/they", "She/they", "He/she", "He/she/they", "Ask me"];

     data.public.pronouns = array[pronouns];
     await helpers.PushPlayerData(req.user.id, data);
     return res.status(200).send();
});

router.post("/report", middleware.authenticateToken, async (req, res) => {
     if(!(Object.keys(req.body).includes("target") && Object.keys(req.body).includes("reason"))) return res.status(400).send("Insufficient data sent!");
     const { target, reason } = req.body;

     var report = {
          timestamp: Date.now(),
          reportingUser: req.user.id,
          reportedUser: target,
          reason: reason
     }

     var reportingData = await helpers.PullPlayerData(req.user.id);

     if(reportingData.auth.reportedUsers.includes(target)) return res.status(400).send("You have already reported this user!");
     if(req.user.id == target) return res.status(403).send("You cannot report yourself.");

     var data = await helpers.PullPlayerData(target);

     data.auth.recievedReports.push(report);

     await helpers.PushPlayerData(target, data);

     reportingData.auth.reportedUsers.push(target);

     await helpers.PushPlayerData(req.user.id, reportingData);

     helpers.auditLog(`!MODERATION! User ${req.user.id} filed a report against user ${target} for the reason of ${reason}`, false);
     
     res.status(200).send("Report successfully applied. Thank you for helping keep Compensation VR safe.");
     await helpers.onPlayerReportedCallback(report);
});

//Ban a user's account
router.post("/:id/ban", middleware.authenticateDeveloperToken, async (req, res) => {
     const { id } = req.params;
     const { reason, duration } = req.body;
     const moderator = req.user;

     await helpers.BanPlayer(id, reason, duration);

     helpers.auditLog(`!DEVELOPER ACTION! User ${id} was banned for ${duration} hours by moderator ${moderator.username}.`, false)
     res.status(200).send();
});

//Set a user's currency balance.
router.post("/:id/currency/set", middleware.authenticateDeveloperToken, async (req, res) => {
     const { id } = req.params;
     let id_clean = sanitize(id);
     const { amount } = req.body;

     const exists = fs.existsSync(`./data/accounts/${id_clean}.json`);
     if(!exists) return res.status(404).send("User not found!");

     let data = await helpers.PullPlayerData(id_clean);

     if(amount < 0) return res.status(400).send("Final currency amount cannot be less than 0.");

     data.private.currency = amount;

     await helpers.PushPlayerData(id_clean, data);

     helpers.auditLog(`!DEVELOPER ACTION! User ${req.user.username} with ID ${req.user.id} set user ${id}'s currency to ${amount}.`, false);

     res.status(200).send("Action successful.");
});

//Modify a user's currency balance.
router.post("/:id/currency/modify", middleware.authenticateDeveloperToken, async (req, res) => {
     const { id } = req.params;
     let id_clean = sanitize(id);
     const { amount } = req.body;

     const exists = fs.existsSync(`./data/accounts/${id_clean}.json`);
     if(!exists) return res.status(404).send("User not found!");

     let data = await helpers.PullPlayerData(id_clean);

     if(!(data.private.currency + amount >= 0)) return res.status(400).send("Final currency amount cannot be less than 0.");

     data.private.currency += amount;

     await helpers.PushPlayerData(id_clean, data)

     helpers.auditLog(`!DEVELOPER ACTION! User ${req.user.username} with ID ${req.user.id} modified user ${id}'s currency balance by ${amount}, with a final balance of ${data.private.currency}.`, false);

     res.status(200).send("Action successful.");
});

router.get("/search", async (req, res) => {
     var {type, query, case_sensitive} = req.query;
     if(typeof query != 'string') return res.status(400).send("No query specified!");
     if(typeof type != 'string') type = 'username';
     if(typeof case_sensitive != 'string') case_sensitive = false;
     else case_sensitive = case_sensitive == 'true' ? true : false;

     const db = require('../index').mongoClient.db(process.env.MONGOOSE_DATABASE_NAME);
     const all = await db.collection('accounts').find({}).toArray();

     switch (type) {
          case "username":
               type = "public.username";
               break;
          case "nickname":
               type = "public.nickname";
               break;
          case "bio":
               type = "public.bio";
               break;
          default:
               type = "public.username";
               break;
     }

     const fuse = new Fuse(all, {
          includeScore: false,
          keys: [type]
     });

     const fuseResult = fuse.search(query);
     
     var finalResults = [];
     fuseResult.map((item) => {
          finalResults.push(item.item.auth.id);
     });
     return res.status(200).json(finalResults);
});

module.exports = router;