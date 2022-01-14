require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const sanitize = require('sanitize-filename');

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
     ClearPlayerNotification: ClearPlayerNotification
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