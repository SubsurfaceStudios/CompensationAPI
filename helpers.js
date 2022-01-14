require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const sanitize = require('sanitize-filename');

const notificationTemplates = {
     invite: "invite",
     friendRequest: "friendRequest",
     messageRecieved: "messageRecieved"
}

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
     onPlayerReportedCallback: onPlayerReportedCallback
};

function PullPlayerData(id) {
     try {
          let id_clean = sanitize(id.toString());
          var data = JSON.parse(fs.readFileSync(`../data/accounts/${id_clean}.json`));
          return data;
     } catch (exception) {
          console.error(exception);
          return null;
     }
}

function PushPlayerData(id, data) {
     data = JSON.stringify(data, null, "     ");
     let id_clean = sanitize(id.toString());
     fs.writeFileSync(`../data/accounts/${id_clean}.json`, data);
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



function auditLog(message) {
     const file = fs.readFileSync("./data/audit.json");
     let data = JSON.parse(file);

     const ts = Date.now();

     const log = `${ts} - ${message}`;

     data.push(log);
     const final = JSON.stringify(data, null, "   ");
     fs.writeFileSync("./data/audit.json", final);
}

function MergeArraysWithoutDuplication(array1, array2) {
     return array1.concat(array2.filter((item) => array1.indexOf(item) < 0));
}

function onPlayerReportedCallback(reportData) {
     var reportedData = helpers.PullPlayerData(reportData.reportedUser);
     var reportingData = helpers.PullPlayerData(reportData.reportingUser);

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