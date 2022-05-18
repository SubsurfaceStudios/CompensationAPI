const router = require('express').Router();
const helpers = require('../helpers');
const middleware = require('../middleware');
const sanitize = require('sanitize-filename');
//minor change for commit test
// whoopty do another fake commit
const notificationTemplates = {
     invite: "invite",
     friendRequest: "friendRequest",
     messageRecieved: "messageRecieved"
}

router.get("/imgfeed", async (req, res) => {
     try {
          var {count, reverse, offset} = req.query;

          const client = require('../index').mongoClient;
          const db = client.db(process.env.MONGOOSE_DATABASE_NAME);
          const image_collection = db.collection("images");
          
          const all_images = await image_collection.find().toArray();
          const image_count = all_images.length;
          
          // input validation
          try {
               count = parseInt(count);
               if(isNaN(count)) count = 50;
          } catch {
               return res.status(400).send({message: "cannot_parse_count"});
          }

          try {
               offset = parseInt(offset);
               if(isNaN(offset)) return res.status(400).send({message: "cannot_parse_offset"});
               if(image_count < offset) return res.status(400).send({message: "not_enough_images"});
          } catch {
               return res.status(400).send({message: "cannot_parse_offset"});
          }

          if(image_count < (count + offset)) count = (image_count - offset) - 1;

          var feed = [];
          if(typeof reverse != 'undefined' && reverse != "false") {
               for(let i = 1; i < count + 1; i++) 
                    feed.push(all_images[(image_count - offset) - i]);
          } else {
               for(let i = 0; i < count; i++)
                    feed.push(all_images[offset + i]);
          }

          return res.status(200).json(feed);
     } catch (ex) {
          return res.sendStatus(500);
     }
});

router.get("/takenby", async (req, res) => {

     try {
          var {target, count, offset} = req.query;

          // Guard Clauses
          if(typeof target !== 'string') return res.status(400).send({message: "Search target not specified in URL-Encoded parameter `target`"});

          // Parameter validation
          if(typeof count !== 'string') count = 50;
          else try {
               count = parseInt(count);
          } catch {
               count = 50;
          }

          if(typeof offset !== 'string') offset = 0;
          else try {
               offset = parseInt(offset);
               if(offset < 0) offset = 0;
          } catch {
               offset = 0;
          }

          // True if any value present, otherwise false.

          var db = require('../index').mongoClient.db(process.env.MONGOOSE_DATABASE_NAME);

          var collection = db.collection("images");
          var filtered_images = await collection.find({'takenBy.id': target}).toArray();

          // const filtered_images = all_images.filter(item => item.takenBy.id == target);
          const ImageCount = filtered_images.length;

          // Ensure proper count handling.
          if(count + offset > ImageCount) {
               var discrepency = ImageCount - (count + offset)
               if(count + discrepency > 0) count += discrepency;
               else return res.status(404).send({message: "There are not enough images to fulfill your request with the given offset."});
          }

          // Push image data into array and serve.
          var final_response = [];
          for (let index = offset; index < count + offset; index++) {
               final_response.push(filtered_images[index]);
          }

          return res.status(200).json(final_response);
     } catch {
          return res.sendStatus(500);
     }
});

router.get("/takenwith", async (req, res) => {

     try {
          var {target, count, offset} = req.query;

          // Guard Clauses
          if(typeof target !== 'string') return res.status(400).send({message: "Search target not specified in URL-Encoded parameter `target`"});

          // Parameter validation
          if(typeof count !== 'string') count = 50;
          else try {
               count = parseInt(count);
          } catch {
               count = 50;
          }

          if(typeof offset !== 'string') offset = 0;
          else try {
               offset = parseInt(offset);
               if(offset < 0) offset = 0;
          } catch {
               offset = 0;
          }

          var db = require('../index').mongoClient.db(process.env.MONGOOSE_DATABASE_NAME);

          var collection = db.collection("images");
          var filtered_images = await collection.find({others: {$all: [target]}}).toArray();

          const ImageCount = filtered_images.length;

          // Ensure proper count handling.
          if(count + offset > ImageCount) {
               var discrepency = ImageCount - (count + offset)
               if(count + discrepency > 0) count += discrepency;
               else return res.status(404).send({message: "There are not enough images to fulfill your request with the given offset."});
          }

          // Push image data into array and serve.
          var final_response = [];
          for (let index = offset; index < count + offset; index++) {
               final_response.push(filtered_images[index]);
          }

          return res.status(200).json(final_response);
     } catch {
          return res.sendStatus(500);
     }
});

router.post("/friend-request", middleware.authenticateToken, async (req, res) => {
     var {target} = req.body;

     var sendingData = helpers.PullPlayerData(req.user.id);
     var recievingData = helpers.PullPlayerData(target);

     if(helpers.ArePlayersAnyFriendType(req.user.id, target)) return res.status(400).send("You are already friends with this player.");
     if(sendingData.private.friendRequestsSent.includes(target)) return res.status(400).send("You have already sent a friend request to this player, duplicate requests are not permitted.");

     helpers.NotifyPlayer(target, notificationTemplates.friendRequest, {
          "sendingPlayer": req.user.id,
          "headerText": `Friend Request`,
          "bodyText": `Hey there ${recievingData.public.nickname}! ${sendingData.public.nickname} has sent you a friend request! Press the "Profile" button to see their profile. Press "Accept" to become friends with them, or press "Ignore" to decline the request!`,
          "continueText": `Accept`,
          "cancelText": "Ignore"
     });

     res.status(200).send("Successfully sent friend request to player!");
     sendingData.private.friendRequestsSent.push(target);
     helpers.PushPlayerData(req.user.id, sendingData);
});

router.post("/accept-request", middleware.authenticateToken, async (req, res) => {
     var {target} = req.body;
     if(typeof target !== 'string') return res.status(400).send("No target specified.");
     target = sanitize(target);

     var recievingData = helpers.PullPlayerData(req.user.id);
     var sendingData = helpers.PullPlayerData(target);

     var filteredNotifications = recievingData.notifications.filter(item => item.template == notificationTemplates.friendRequest && item.parameters.sendingPlayer == target);

     for (let index = 0; index < filteredNotifications.length; index++) {
          let itemIndex = recievingData.notifications.findIndex(item => item.template == notificationTemplates.friendRequest && item.parameters.sendingPlayer == target);
          recievingData.notifications.splice(itemIndex);
     }
     
     if(filteredNotifications.length > 0) helpers.PushPlayerData(req.user.id, recievingData);

     if(helpers.ArePlayersAnyFriendType(req.user.id, target)) return res.status(400).send("You are already friends with this player.");

     if(!sendingData.private.friendRequestsSent.includes(req.user.id)) return res.status(400).send("This player has not sent you a friend request. API magic won't help you here buddy.");

     helpers.AddAcquaintance(req.user.id, target, true);

     res.status(200).send("Successfully added acquaintance.");

     // eslint-disable-next-line no-redeclare
     var sendingData = helpers.PullPlayerData(target);
     
     var index = sendingData.private.friendRequestsSent.findIndex(item => item == req.user.id);
     if(index >= 0) sendingData.private.friendRequestsSent.splice(index);
     helpers.PushPlayerData(target, sendingData);
});

router.get("/sent-requests", middleware.authenticateToken, async (req, res) => {
     var data = helpers.PullPlayerData(req.user.id);
     res.status(200).json(data.private.friendRequestsSent);  
});

router.post("/make-acquaintance", middleware.authenticateToken, async (req, res) => {
     var {target} = req.body;
     if(!target) return res.status(400).send("You did not specify a target!");
     var sender = req.user.id;

     if(!helpers.ArePlayersAnyFriendType(sender, target)) return res.status(400).send("You are not acquaintances, friends, or favorite friends with this user.");

     helpers.RemoveFriend(sender, target, false);
     helpers.RemoveFavoriteFriend(sender, target, false);

     helpers.AddAcquaintance(sender, target, false);
     res.sendStatus(200);
});

router.post("/make-friend", middleware.authenticateToken, async (req, res) => {
     var {target} = req.body;
     if(!target) return res.status(400).send("You did not specify a target!");
     var sender = req.user.id;

     if(!helpers.ArePlayersAnyFriendType(sender, target)) return res.status(400).send("You are not acquaintances, friends, or favorite friends with this user.");

     helpers.RemoveAcquaintance(sender, target, false);
     helpers.RemoveFavoriteFriend(sender, target, false);

     helpers.AddFriend(sender, target, false);
     res.sendStatus(200);
});

router.post("/make-favorite-friend", middleware.authenticateToken, async (req, res) => {
     var {target} = req.body;
     if(!target) return res.status(400).send("You did not specify a target!");
     var sender = req.user.id;

     if(!helpers.ArePlayersAnyFriendType(sender, target)) return res.status(400).send("You are not acquaintances, friends, or favorite friends with this user.");

     helpers.RemoveAcquaintance(sender, target, false);
     helpers.RemoveFriend(sender, target, false);

     helpers.AddFavoriteFriend(sender, target, false);
     res.sendStatus(200);
});

router.post("/remove-friend", middleware.authenticateToken, async (req, res) => {
     var {target} = req.body;
     if(!target) return res.status(400).send("You did not specify a target!");
     var sender = req.user.id;

     if(!helpers.ArePlayersAnyFriendType(sender, target)) return res.status(400).send("You are not acquaintances, friends, or favorite friends with this user.");

     helpers.RemoveAcquaintance(sender, target, true);
     helpers.RemoveFriend(sender, target, true);
     helpers.RemoveFavoriteFriend(sender, target, true);
     res.sendStatus(200);
});

router.post("/decline-request", middleware.authenticateToken, async (req, res) => {
     var {target} = req.body;
     if(!target) return res.status(400).send("You did not specify a target!");
     const sender = req.user.id;

     if(helpers.ArePlayersAnyFriendType(sender, target)) return res.status(400).send("You are already acquaintances, friends, or favorite friends with this player!");

     var sendingData = helpers.PullPlayerData(target);
     if(sendingData == null) return res.status(404).send("That user does not exist!");

     var recievingData = helpers.PullPlayerData(sender);
     
     if(!sendingData.private.friendRequestsSent.includes(sender)) return res.status(400).send("You do not have a pending friend request from this player!");

     while(sendingData.private.friendRequestsSent.includes(sender)) {
          const index = sendingData.private.friendRequestsSent.findIndex(item => item == sender);
          sendingData.private.friendRequestsSent.splice(index);
     }
     helpers.PushPlayerData(target, sendingData);

     var temp = recievingData.notifications.filter(item => item.template == notificationTemplates.friendRequest && item.parameters.sendingPlayer == target);
     for (let index = 0; index < temp.length; index++) {
          let itemIndex = recievingData.notifications.findIndex(item => item.template == notificationTemplates.friendRequest && item.parameters.sendingPlayer == target);
          if(itemIndex >= 0) recievingData.notifications.splice(itemIndex);
          else break;
     }

     helpers.PushPlayerData(sender, recievingData);
     res.status(200).send("Declined friend request.");
});

router.get("/acquaintances", middleware.authenticateToken, async (req, res) => {
     const data = helpers.PullPlayerData(req.user.id);
     var dictionary = {};
     for (let index = 0; index < data.private.acquaintances.length; index++) {
          const element = data.private.acquaintances[index];
          let player = helpers.PullPlayerData(element);
          dictionary[element] = player.public;
     }
     return res.status(200).json(dictionary);
});

router.get("/friends", middleware.authenticateToken, async (req, res) => {
     const data = helpers.PullPlayerData(req.user.id);
     var dictionary = {};
     for (let index = 0; index < data.private.friends.length; index++) {
          const element = data.private.friends[index];
          let player = helpers.PullPlayerData(element);
          dictionary[element] = player.public;
     }
     return res.status(200).json(dictionary);
});

router.get("/favorite-friends", middleware.authenticateToken, async (req, res) => {
     const data = helpers.PullPlayerData(req.user.id);
     var dictionary = {};
     for (let index = 0; index < data.private.favoriteFriends.length; index++) {
          const element = data.private.favoriteFriends[index];
          let player = helpers.PullPlayerData(element);
          dictionary[element] = player.public;
     }
     return res.status(200).json(dictionary);
});

router.get("/all-friend-types", middleware.authenticateToken, async (req, res) => {
     const data = helpers.PullPlayerData(req.user.id);

     const array1 = helpers.MergeArraysWithoutDuplication(data.private.acquaintances, data.private.friends);
     const all = helpers.MergeArraysWithoutDuplication(array1, data.private.favoriteFriends);

     var dictionary = {};
     for (let index = 0; index < all.length; index++) {
          const element = all[index];
          let player = helpers.PullPlayerData(element);
          dictionary[element] = player.public;
     }
     return res.status(200).json(dictionary);
});

module.exports = router;