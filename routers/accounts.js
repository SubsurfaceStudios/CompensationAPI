const router = require('express').Router();
const helpers = require('../helpers');
const middleware = require('../middleware');
const regex = require('../data/badwords/regexp');
const { authenticateDeveloperToken, authenticateToken_optional } = require('../middleware');
const { PullPlayerData, PushPlayerData, check } = require('../helpers');
const express = require('express');
const Fuse = require('fuse.js');
const { WebSocketV2_MessageTemplate } = require('../index');
const { MatchmakingModes, GetInstances } = require('./matchmaking');

router.use(express.urlencoded({extended: false}));

//Call to get the public account data of a user.
router.get("/:id/public", authenticateToken_optional, async (req, res) => {
    const { id } = req.params;
    let data = await helpers.PullPlayerData(id);
    let authenticated = typeof req.user == 'object';
    
    if (data !== null) {
        var send = data.public;
        const clients = require('./ws/WebSocketServerV2').ws_connected_clients;

        send.presence = typeof clients[id] == 'object' 
        ? {
            online: true,
            roomId: clients[id].roomId
        } : {
            online: false,
            roomId: null
        };

        if(authenticated && Object.keys(clients).includes(req?.user?.id)) {
            let own = await helpers.PullPlayerData(req.user.id);

            let areAcquaintances = own.private.acquaintances.includes(id);
            let areFriends = own.private.friends.includes(id);
            let areFavoriteFriends = own.private.favoriteFriends.includes(id);

            let friendRequestSent = 
                own.private.friendRequestsSent.includes(id);

            send.social_options = {
                can_send_friend_request:
                    !areAcquaintances &&
                    !areFriends &&
                    !areFavoriteFriends &&
                    !friendRequestSent,
                can_make_acquaintance:
                    !areAcquaintances &&
                    (
                        areFriends ||
                        areFavoriteFriends
                    ) &&
                    !friendRequestSent,
                can_make_friend:
                    !areFriends &&
                    (
                        areAcquaintances ||
                        areFavoriteFriends
                    ) &&
                    !friendRequestSent,
                can_make_favorite_friend:
                    !areFavoriteFriends &&
                    (
                        areAcquaintances ||
                        areFriends
                    ) &&
                    !friendRequestSent,
                can_remove_friend:
                    (
                        areAcquaintances ||
                        areFriends ||
                        areFavoriteFriends
                    ) &&
                    !friendRequestSent
            };
            
            let instance = null;
            if(Object.keys(clients).includes(id)) instance = 
                (await GetInstances(clients[id].roomId))
                .find(x => x.JoinCode == clients[id].joinCode);

            let public = false;
            if(instance != null) {
                public = 
                    instance.MatchmakingMode == MatchmakingModes.Public ||
                    instance.MatchmakingMode == MatchmakingModes.Unlisted;         
            }
    
            send.matchmaking_options = {
                can_invite: Object.keys(clients).includes(id) &&
                    clients[req.user.id].joinCode != clients[id].joinCode,
                can_go_to: 
                    public &&
                    clients[req.user.id].joinCode != clients[id].joinCode
            };

        }


        return res.status(200).send(send);
    } else {
        return res.status(404).send({message: `Account with ID of ${id} not found. Please check your request for errors.`, code: "account_not_found"});
    }
});

//(Authorized) Call to get the private account data of a user.
router.get("/:id/private", middleware.authenticateToken, async (req, res) => {
    const { id } = req.params;

    if(req.user.id !== id) return res.status(403).send("Token user does not have access to the specified user's private data!");

    const data = await helpers.PullPlayerData(id);
    if(data === null)
        return res.status(404).send(`Account with ID of ${id} not found. Please check your request for typos.`);

    return res.status(200).send(data.private);
});

//Call to get the first account with the specified username in the database, and return its ID.
router.get("/:username/ID", async (req, res) => {
    const { username } = req.params;
    const id = await helpers.getUserID(username);

    if(id === null) return res.status(404).send("User not present in database.");

    return res.status(200).send({ id: id, message: `User ${username} found in database with ID ${id}`});
});

router.get("/:id/edit", authenticateDeveloperToken, async (req, res) => {
    var {id} = req.params;
    var data = await PullPlayerData(id);
    if(data === null) return res.status(404).send("Account not found.");
    else return res.status(200).json(data);
});

router.post("/:id/edit", authenticateDeveloperToken, async (req, res) => {
    var {id} = req.params;

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
    if(check(nickname)) {
        helpers.auditLog(`Suspicious nickname change! ${req.user.id} attempted to change nickname to ${nickname}. Request permitted, but please review it.`);
    }
    data.public.nickname = nickname;

    await helpers.PushPlayerData(req.user.id, data);

    helpers.auditLog(`${req.user.id} changed their nickname to ${nickname}`, false);
    return res.sendStatus(200);
});

router.post("/bio", middleware.authenticateToken, async (req, res) => {
    var { bio } = req.body;

    var data = await helpers.PullPlayerData(req.user.id);

    if(regex.test(bio)) {
        helpers.auditLog(`Suspicious nickname change! ${req.user.id} attempted to change nickname to ${bio}. Request permitted, but please review it.`);
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
    if(typeof pronouns != 'number') return res.status(400).send("You did not specify a pronoun to use.");

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
    };

    var reportingData = await helpers.PullPlayerData(req.user.id);

    if(reportingData.auth.reportedUsers.includes(target)) return res.status(400).send("You have already reported this user!");
    if(req.user.id === target) return res.status(403).send("You cannot report yourself.");

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
    try {
        const { id } = req.params;
        const { reason, duration } = req.body;
          
        await helpers.BanPlayer(id, reason, duration, req.user.id);
          
        helpers.auditLog(`!DEVELOPER ACTION! User ${id} was banned for ${duration} hours by moderator ${req.user.username}.`, false);
        res.sendStatus(200);
    } catch (ex) {
        res.sendStatus(500);
        throw ex;
    }
});

//Set a user's currency balance.
router.post("/:id/currency/set", middleware.authenticateDeveloperToken, async (req, res) => {
    const { id } = req.params;
    const { amount } = req.body;
     
    let data = await helpers.PullPlayerData(id);
    if(data === null) return res.status(404).send("User not found!");

    if(amount < 0) return res.status(400).send("Final currency amount cannot be less than 0.");

    data.private.currency = amount;

    await helpers.PushPlayerData(id, data);

    helpers.auditLog(`!DEVELOPER ACTION! User ${req.user.username} with ID ${req.user.id} set user ${id}'s currency to ${amount}.`, false);

    res.status(200).send("Action successful.");
});

//Modify a user's currency balance.
router.post("/:id/currency/modify", middleware.authenticateDeveloperToken, async (req, res) => {
    const { id } = req.params;
    const { amount } = req.body;
     
    let data = await helpers.PullPlayerData(id);
    if(data === null) return res.status(404).send("User not found!");

    if(!(data.private.currency + amount >= 0)) return res.status(400).send("Final currency amount cannot be less than 0.");

    data.private.currency += amount;

    await helpers.PushPlayerData(id, data);

    helpers.auditLog(`!DEVELOPER ACTION! User ${req.user.username} with ID ${req.user.id} modified user ${id}'s currency balance by ${amount}, with a final balance of ${data.private.currency}.`, false);

    res.status(200).send("Action successful.");
});

router.get("/search", async (req, res) => {
    var {type, query, case_sensitive} = req.query;
    if(typeof query != 'string') return res.status(400).send("No query specified!");
    if(typeof type != 'string') type = 'username';
    if(typeof case_sensitive != 'string') case_sensitive = false;
    else case_sensitive = case_sensitive === 'true' ? true : false;

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
        finalResults.push(item.item._id);
    });
    return res.status(200).json(finalResults);
});

router.route("/:id/tags/:tag").
    put(middleware.authenticateDeveloperToken, async (req, res) => {
        try {
            const { id, tag} = req.params;

            const account = await helpers.PullPlayerData(id);
            if(account === null) return res.status(404).send({code: "user_not_found", message: "A user with that ID does not exist in our records."});

            if(!account.private.availableTags.includes(tag)) {
                account.private.availableTags.push(tag);
                await helpers.PushPlayerData(id, account);
            }

            helpers.auditLog(`!DEVELOPER ACTION! User ${req.user.username} with ID ${req.user.id} added tag ${tag} to user ${id}.`, false);
            res.sendStatus(200);
        } catch (ex) {
            res.sendStatus(500);
            throw ex;
        }
    })
    .delete(middleware.authenticateDeveloperToken, async (req, res) => {
        try {
            const { id, tag} = req.params;

            const account = await helpers.PullPlayerData(id);
            if(account === null) return res.status(404).send({code: "user_not_found", message: "A user with that ID does not exist in our records."});

            if(account.private.availableTags.includes(tag)) {
                account.private.availableTags.splice(account.private.availableTags.indexOf(tag));
                await helpers.PushPlayerData(id, account);
            }

            helpers.auditLog(`!DEVELOPER ACTION! User ${req.user.username} with ID ${req.user.id} removed tag ${tag} from user ${id}.`, false);
            res.sendStatus(200);
        } catch (ex) {
            res.sendStatus(500);
            throw ex;
        }
    });

router.post('/invite', middleware.authenticateToken, async (req, res) => {
    var { id, expiresAfter } = req.body;

    if(typeof id != 'string') return res.status(400).send({code: "unspecified_parameter", message: "You did not specify the player to invite."});
    if(typeof expiresAfter != 'string') expiresAfter = 300000;
    else {
        expiresAfter = parseInt(expiresAfter);
        if(isNaN(expiresAfter)) expiresAfter = 300000; // not gonna bother responding with an error, just default the value
    }

    const self = await helpers.PullPlayerData(req.user.id);

    const clients = require('./ws/WebSocketServerV2').ws_connected_clients;
    if(!Object.keys(clients).includes(id)) return res.status(400).send({code: "player_not_online", message: "That player is not online. Please try again later."});
    if(!Object.keys(clients).includes(req.user.id)) return res.status(400).send({code: "self_not_online", message: "You are not currently in-game."});
    const data = await helpers.PullPlayerData(id);
    if(data === null) return res.status(404).send({code: "player_not_found", message: "That player does not exist."});

    // the joinCode to allow the client to join the room is privellaged information,
    // and should NEVER be sent unless we want the client to join a room.
    const notification = {
        template: "invite",
        parameters: {
            sendingPlayer: req.user.id,
            headerText: "Invite Recieved",
            bodyText: `@${self.public.username} has invited you to play with them!`,
            cancelText: "Decline",
            continueText: "Accept",
            sentAt: Date.now().toString()
        }
    };

    if(data.notifications.findIndex(item => item.template === 'invite' && item.parameters.sendingPlayer === req.user.id) === -1) {
        data.notifications.push(notification);
        await helpers.PushPlayerData(id, data);
        var send = WebSocketV2_MessageTemplate;
        send.code = "standard_notification_recieved";
        send.data = {};
        require('./ws/WebSocketServerV2').ws_connected_clients[id].socket.send(JSON.stringify(send, null, 5));
        return res.sendStatus(200);
    }

    return res.status(400).send({code: "invite_denied", message: "You can only send a player ONE invite until they accept or decline it. After that you may send them ONE more, and the process repeats."});
});

router.post('/force-pull', middleware.authenticateDeveloperToken, async (req, res) => {
    var { id } = req.body;

    if(typeof id != 'string') return res.status(400).send({code: "unspecified_parameter", message: "You did not specify the player to invite."});

    const clients = require('./ws/WebSocketServerV2').ws_connected_clients;
    if(!Object.keys(clients).includes(id)) return res.status(400).send({code: "player_not_online", message: "That player is not online. Please try again later."});
    if(!Object.keys(clients).includes(req.user.id)) return res.status(400).send({code: "self_not_online", message: "You are not currently in-game."});
    const data = await helpers.PullPlayerData(id);
    if(data === null) return res.status(404).send({code: "player_not_found", message: "That player does not exist."});

    var selfClient = clients[req.user.id];
    clients[id].socket.emit('force-pull', selfClient.roomId, selfClient.joinCode);
    res.sendStatus(200);
});

router.post('/set-pfp/:id', middleware.authenticateToken, async (req, res) => {
    try {
        var client = require('../index').mongoClient;

        var { id } = req.params;

        var image_meta = await client.db(process.env.MONGOOSE_DATABASE_NAME).collection("images").findOne({ _id: { $eq: parseInt(id), $exists: true } });

        if (image_meta == null) return res.status(404).json({
            code: "image_not_found",
            message: "Unable to find an image with that ID."
        });

        if (image_meta.takenBy.id != req.user.id) return res.status(400).json({
            code: "not_photographer",
            message: "You did not take this photo, so you cannot use it as your profile picture."
        });

        var data = await PullPlayerData(req.user.id);
        data.public.profile_picture_id = id;
        await PushPlayerData(req.user.id, data);

        res.status(200).json({
            code: "success",
            message: "Successfully set profile picture."
        });
    } catch (ex) {
        res.status(500).json({
            code: "internal_error",
            message: "An internal server error occurred and we were unable to set your profile picture. Please try again later."
        });
        throw ex;
    }
});
module.exports = router;