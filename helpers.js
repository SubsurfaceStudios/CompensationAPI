require('dotenv').config();
const fs = require('fs');
const config = require('./config.json');

const notificationTemplates = {
    invite: "invite",
    friendRequest: "friendRequest",
    messageRecieved: "messageRecieved"
};

module.exports = {
    PullPlayerData: PullPlayerData,
    PushPlayerData: PushPlayerData,
    NotifyPlayer: NotifyPlayer,
    ArePlayersAnyFriendType: ArePlayersAnyFriendType,
    ArePlayersAcquantances: ArePlayersAcquantances,
    ArePlayersFriends: ArePlayersFriends,
    ArePlayersFavoriteFriends: ArePlayersFavoriteFriends,
    RemoveAcquaintance: RemoveAcquaintance,
    RemoveFriend: RemoveFriend,
    RemoveFavoriteFriend: RemoveFavoriteFriend,
    AddFriend: AddFriend,
    AddFavoriteFriend: AddFavoriteFriend,
    AddAcquaintance: AddAcquaintance,
    ClearPlayerNotification: ClearPlayerNotification,
    getUserID: getUserID,
    getAccountCount: getAccountCount,
    auditLog: auditLog,
    MergeArraysWithoutDuplication: MergeArraysWithoutDuplication,
    BanPlayer: BanPlayer,
    onPlayerReportedCallback: onPlayerReportedCallback,
    check: check
};

async function PullPlayerData(id) {
    const db = require('./index').mongoClient.db(process.env.MONGOOSE_DATABASE_NAME);
    const account = await db.collection('accounts').findOne({_id: {$eq: id, $exists: true}});
    return account;
}

async function PushPlayerData(id, data) {
    const db = require('./index').mongoClient.db(process.env.MONGOOSE_DATABASE_NAME);
    await db.collection('accounts').replaceOne({_id: {$eq: id, $exists: true}}, data, {upsert: true});
}

async function NotifyPlayer(id, template, params) {
    if(!(Object.values(notificationTemplates).includes(template))) return false;
    var data = await PullPlayerData(id);
    if(data === null) return false;

    const notification = {
        template: template,
        parameters: params
    };
    data.notifications.push(notification);

    await PushPlayerData(id, data);
    return true;
}

async function ArePlayersAnyFriendType(player1, player2) {
    var data = await PullPlayerData(player1);
    var data2 = await PullPlayerData(player2);
    return data.private.acquaintances.includes(player2) || 
          data.private.friends.includes(player2) || 
          data.private.favoriteFriends.includes(player2) ||
          data2.private.acquaintances.includes(player1) || 
          data2.private.friends.includes(player1) ||
          data2.private.favoriteFriends.includes(player1);
}

async function ArePlayersAcquantances(player1, player2) {
    var data = await PullPlayerData(player1);
    var data2 = await PullPlayerData(player2);
    return data.private.acquaintances.includes(player2) ||
          data2.private.acquaintances.includes(player1);
}

async function ArePlayersFriends(player1, player2) {
    var data = await PullPlayerData(player1);
    var data2 = await PullPlayerData(player2);
    return data.private.friends.includes(player2) ||
          data2.private.friends.includes(player1);
}

async function ArePlayersFavoriteFriends(player1, player2) {
    var data = await PullPlayerData(player1);
    var data2 = await PullPlayerData(player2);
    return data.private.favoriteFriends.includes(player2) ||
          data2.private.favoriteFriends.includes(player1);
}

async function RemoveAcquaintance(player1, player2, both) {
    var data1 = await PullPlayerData(player1);
    var data2 = await PullPlayerData(player2);

    var index1 = data1.private.acquaintances.findIndex(item => item === player2);
    if(index1 >= 0) data1.private.acquaintances.splice(index1);

    var index2 = data2.private.acquaintances.findIndex(item => item === player1);
    if(index2 >= 0 && both) data2.private.acquaintances.splice(index2);

    await PushPlayerData(player1, data1);
    await PushPlayerData(player2, data2);
}

async function RemoveFriend(player1, player2, both) {
    var data1 = await PullPlayerData(player1);
    var data2 = await PullPlayerData(player2);

    var index1 = data1.private.friends.findIndex(item => item === player2);
    if(index1 >= 0) data1.private.friends.splice(index1);

    var index2 = data2.private.friends.findIndex(item => item === player1);
    if(index2 >= 0 && both) data2.private.friends.splice(index2);

    await PushPlayerData(player1, data1);
    await PushPlayerData(player2, data2);
}

async function RemoveFavoriteFriend(player1, player2, both) {
    var data1 = await PullPlayerData(player1);
    var data2 = await PullPlayerData(player2);

    var index1 = data1.private.favoriteFriends.findIndex(item => item === player2);
    if(index1 >= 0) data1.private.favoriteFriends.splice(index1);

    var index2 = data2.private.favoriteFriends.findIndex(item => item === player1);
    if(index2 >= 0 && both) data2.private.favoriteFriends.splice(index2);

    await PushPlayerData(player1, data1);
    await PushPlayerData(player2, data2);
}

async function AddAcquaintance(player1, player2, both) {
    var data1 = await PullPlayerData(player1);
    var data2 = await PullPlayerData(player2);

    if(!data1.private.acquaintances.includes(player2)) 
    {
        data1.private.acquaintances.push(player2);
        await PushPlayerData(player1, data1);
    }
    if(!data2.private.acquaintances.includes(player1) && both) {
        data2.private.acquaintances.push(player1);
        await PushPlayerData(player2, data2);
    }
}

async function AddFriend(player1, player2, both) {
    var data1 = await PullPlayerData(player1);
    var data2 = await PullPlayerData(player2);

    if(!data1.private.friends.includes(player2)) 
    {
        data1.private.friends.push(player2);
        await PushPlayerData(player1, data1);
    }
    if(!data2.private.friends.includes(player1) && both) {
        data2.private.friends.push(player1);
        await PushPlayerData(player2, data2);
    }
}

async function AddFavoriteFriend(player1, player2, both) {
    var data1 = await PullPlayerData(player1);
    var data2 = await PullPlayerData(player2);

    if(!data1.private.favoriteFriends.includes(player2)) 
    {
        data1.private.favoriteFriends.push(player2);
        await PushPlayerData(player1, data1);
    }
    if(!data2.private.favoriteFriends.includes(player1) && both) {
        data2.private.favoriteFriends.push(player1);
        await PushPlayerData(player2, data2);
    }
}

async function ClearPlayerNotification(id, IndexOrData) {
    var data = await PullPlayerData(id);


    var mode = ( typeof(IndexOrData) == 'number' ) ? "id" : "data";

    if(mode === "id") {
        data.notifications = data.notifications.splice(IndexOrData);
    } else {
        if(data.notifications.includes(IndexOrData)) {
            while (data.notifications.includes(IndexOrData)) {
                var index = data.notifications.findIndex(item => item === IndexOrData);
                if(index > 0) data.notifications = data.notifications.splice(index);
                else break;
            }
        }
    }

    await PushPlayerData(id, data);
}

async function getUserID(username) {
    const db = require('./index').mongoClient.db(process.env.MONGOOSE_DATABASE_NAME);
    const all = await db.collection('accounts').find({}).toArray();
    username = username.toLowerCase();
    for(const item of all) {
        if(item.public.username.toLowerCase() === username.toLowerCase()) return item._id;
    }
    return null;
}

async function getAccountCount() {
    const db = require('./index').mongoClient.db(process.env.MONGOOSE_DATABASE_NAME);
    const count = await db.collection('accounts').countDocuments();
    return count - 1;
}


function auditLog(message, isRaw) {
    const file = fs.readFileSync("./data/audit.json");
    let data = JSON.parse(file);

    const ts = Date.now();

    const log = `${ts} - ${message}`;

    data.push(log);
    const final = JSON.stringify(data, null, "   ");
    fs.writeFileSync("./data/audit.json", final);

    if(!process.env.AUDIT_SERVER_ID || !process.env.AUDIT_WEBHOOK_URI) return console.log("Failed to send webhook audit - either the AUDIT_SERVER_ID or the AUDIT_WEBHOOK_URI has not been set.");
    const globalAuditMessage = 
          isRaw ? 
              `API audit log from server.\nID: \`${process.env.AUDIT_SERVER_ID}\`\nMessage:\n${message}` : 
            `API audit log from server.\nID: \`${process.env.AUDIT_SERVER_ID}\`\nMessage:\`${message}\``;
    
    fetch(
        process.env.AUDIT_WEBHOOK_URI,
        {
            'method': 'POST',
            'headers': {
                'Content-Type': 'application/json'
            },
            'body': JSON.stringify({
                'content': globalAuditMessage
            })
        }
    );
}

/**
 * Merges two arrays without duplication.
 * @param {any[]} a 
 * @param {any[]} b 
 * @returns {any[]} The union of both arrays with no duplicates.
 */
function MergeArraysWithoutDuplication(a, b) {
    return a.concat(b.filter((item) => a.indexOf(item) < 0));
}

/**
 * Called when a player is reported, used to perform administrative actions and potentially ban the player.
 * @param {Object} reportData Information about the report event.
 * @param {Number} reportData.timestamp The timestamp of the report.
 * @param {String} reportData.reportingUser The ID of the user who reported the player.
 * @param {String} reportData.reportedUser The ID of the user who was reported.
 * @param {String} reportData.reason The reason for the report.
 */
async function onPlayerReportedCallback(reportData) {
    var reportedData = await PullPlayerData(reportData.reportedUser);
    var reportingData = await PullPlayerData(reportData.reportingUser);

    if(
        reportingData.private.availableTags.includes("Community Support") ||
          reportingData.private.availableTags.includes("Community Support Team") ||
          reportingData.private.availableTags.includes("Developer") ||
          reportingData.private.availableTags.includes("Moderator") ||
          reportingData.private.availableTags.includes("Founder")
    ) {
        await BanPlayer(reportData.reportedUser, reportData.reason, 1, reportData.reportingUser);
        auditLog(`!! MODERATOR ACTION !!   Moderator ${reportingData.nickname} (@${reportingData.username}) reported user ${reportedData.nickname} (@${reportedData.username}) for the reason of ${reportData.reason}, resulting in them being automatically timed out for 1 hour.`);
          
        var index = reportingData.auth.reportedUsers.findIndex(item => item === reportData.reportedUser);
        if(index >= 0) {
            reportingData.auth.reportedUsers.splice(index);
            await PushPlayerData(reportData.reportingUser, reportingData);
        }
    } else if (reportedData.auth.recievedReports.length >= config.timeout_at_report_count) {
        await BanPlayer(reportData.reportedUser, `Automated timeout for recieving ${config.timeout_at_report_count} or more reports. This timeout will not affect your moderation history unless it is found to be 100% justified.`, 6, reportData.reportingUser);
        auditLog(`!! MODERATION ACTION !! User ${reportingData.nickname} (@${reportedData.username}) was timed out for 6 hours for recieving ${config.timeout_at_report_count} reports. Please investigate!`);
    }
}

/**
 * Bans a player from the game for the specified duration.
 * @param {String} id The ID of the player to ban.
 * @param {String} reason The reason for the ban.
 * @param {Number} duration The duration of the ban in hours.
 * @param {Boolean} moderator Did a moderator ban the player?
 * @returns 
 */
async function BanPlayer(id, reason, duration, moderator) {
    let data = await PullPlayerData(id);

    const endTS = Date.now() + (duration * 60); //convert duration from hours to a unix timestamp
     
    const ban = {
        reason: reason,
        endTS: endTS,
        moderator: moderator
    };

    data.auth.bans.push(ban);
    await PushPlayerData(id, data);

    let clients = require('./routers/ws/WebSocketServerV2').ws_connected_clients;
    if(!Object.keys(clients).includes(id)) return;
    clients[id].socket.close();
}

/**
 * Checks a string for potential profanity. This is not a foolproof method, and should not be used as a replacement for human moderation.
 * Susceptible to the [Scunthorpe Problem](https://en.wikipedia.org/wiki/Scunthorpe_problem).
 * @param {String} string The string to check for potential profanity.
 * @returns {Boolean} Whether or not the string contains the potential for profanity.
 */
function check(string) {
    const words = require('./data/badwords/array');
    const tlc = string.toLowerCase();

    for(const word of words) {
        if(tlc.includes(word)) return true;
    }
    return false;
}