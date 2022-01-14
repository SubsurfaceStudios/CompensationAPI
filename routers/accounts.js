const router = require('express').Router();
const helpers = require('../helpers');
const middleware = require('../middleware');
const BadWordList = JSON.parse(require('../data/external/badwords-master/array.json'));
const sanitize = require('sanitize-filename');


//Call to get the public account data of a user.
router.get("/:id/public", async (req, res) => {
     const { id } = req.params;
     let id_clean = sanitize(id);
     
     if (fs.existsSync(`./data/accounts/${id_clean}.json`)) {
          const data = helpers.PullPlayerData(id_clean);
          return res.status(200).send(data.public);
     } else {
          return res.status(404).send(`Account with ID of ${id_clean} not found. Please check your request for errors.`);
     }
});

//(Authorized) Call to get the private account data of a user.
app.get("/:id/private", middleware.authenticateToken, async(req, res) => {
     const { id } = req.params;
     let id_clean = sanitize(id);

     if(req.user.id !== id) return res.status(403).send("Token user does not have access to the specified user's private data!");

     if (fs.existsSync(`data/accounts/${id_clean}.json`)) {
          const data = helpers.PullPlayerData(id_clean);
          return res.status(200).send(data.private);
     } else {
          return res.status(404).send(`Account with ID of ${id} not found. Please check your request for typos.`);
     }
});

//Call to get the first account with the specified username in the database, and return its ID.
router.get("/:username/ID", async(req, res) => {
     const { username } = req.params;
     const id = helpers.getUserID(username)

     if(id == null) return res.status(404).send("User not present in database.");

     return res.status(200).send({ id: id, message: `User ${username} found in database with ID ${id}`});
});

router.post("/nickname", middleware.authenticateToken, async (req, res) => {
     const { nickname } = req.body;
     var data = await helpers.PullPlayerData(req.user.id);

     //Filter nickname
     BadWordList.forEach(element => {
          if(nickname.toLowerCase().includes(element)) return res.status(403).send("Your nickname contains profanity or inappropriate language. You must change it before you can continue.");
     });
     data.public.nickname = nickname;

     helpers.PushPlayerData(req.user.id, data);
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
     helpers.PushPlayerData(req.user.id, data);

     return res.sendStatus(200);
});

router.post("/tag", middleware.authenticateToken, async (req, res) => {
     const {tag} = req.body;
     
     var data = await helpers.PullPlayerData(req.user.id);
     
     if(!data.private.availableTags.includes(tag)) return res.status(400).send("You do not have access to this tag!");

     data.public.tag = tag;

     helpers.PushPlayerData(req.user.id, data);

     res.sendStatus(200);
});

router.post("/pronouns", middleware.authenticateToken, async (req, res) => {
     const {pronouns} = req.body;

     var data = await helpers.PullPlayerData(req.user.id);
     const array = ["He/Him", "She/Her", "They/Them", "He/they", "She/they", "He/she", "He/she/they", "Ask me"];

     data.public.pronouns = array[pronouns];
     helpers.PushPlayerData(req.user.id, data);
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

     var reportingData = helpers.PullPlayerData(req.user.id);

     if(reportingData.auth.reportedUsers.includes(target)) return res.status(400).send("You have already reported this user!");
     if(req.user.id == target) return res.status(403).send("You cannot report yourself.");

     var data = helpers.PullPlayerData(target);

     data.auth.recievedReports.push(report);

     helpers.PushPlayerData(target, data);

     reportingData.auth.reportedUsers.push(target);

     helpers.PushPlayerData(req.user.id, reportingData);

     helpers.auditLog(`!MODERATION! User ${req.user.id} filed a report against user ${target} for the reason of ${reason}`);
     
     res.status(200).send("Report successfully applied. Thank you for helping keep Compensation VR safe.");
     helpers.onPlayerReportedCallback(report);
});

//Ban a user's account
router.post("/:id/ban", middleware.authenticateDeveloperToken, async (req, res) => {
     const { id } = req.params;
     const { reason, duration } = req.body;
     const moderator = req.user;

     helpers.BanPlayer(id, reason, duration);

     helpers.auditLog(`!DEVELOPER ACTION! User ${id} was banned for ${duration} hours by moderator ${moderator.username}.`)
     res.status(200).send();
});

//Set a user's currency balance.
router.post("/:id/currency/set", middleware.authenticateDeveloperToken, async (req, res) => {
     const { id } = req.params;
     let id_clean = sanitize(id);
     const { amount } = req.body;

     const exists = fs.existsSync(`./data/accounts/${id_clean}.json`);
     if(!exists) return res.status(404).send("User not found!");

     let data = helpers.PullPlayerData(id_clean);

     if(amount < 0) return res.status(400).send("Final currency amount cannot be less than 0.");

     data.private.currency = amount;

     helpers.PushPlayerData(id_clean, data);

     helpers.auditLog(`!DEVELOPER ACTION! User ${req.user.username} with ID ${req.user.id} set user ${id}'s currency to ${amount}.`);

     res.status(200).send("Action successful.");
});

//Modify a user's currency balance.
app.post("/:id/currency/modify", middleware.authenticateDeveloperToken, async (req, res) => {
     const { id } = req.params;
     let id_clean = sanitize(id);
     const { amount } = req.body;

     const exists = fs.existsSync(`./data/accounts/${id_clean}.json`);
     if(!exists) return res.status(404).send("User not found!");

     let data = helpers.PullPlayerData(id_clean);

     if(!(data.private.currency + amount >= 0)) return res.status(400).send("Final currency amount cannot be less than 0.");

     data.private.currency += amount;

     helpers.PushPlayerData(id_clean, data)

     helpers.auditLog(`!DEVELOPER ACTION! User ${req.user.username} with ID ${req.user.id} modified user ${id}'s currency balance by ${amount}, with a final balance of ${data.private.currency}.`);

     res.status(200).send("Action successful.");
});

module.exports = router;