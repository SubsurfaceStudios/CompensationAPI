const router = require('express').Router();
const helpers = require('../helpers');
const middleware = require('../middleware');
const fs = require('fs');
const BadWordList = JSON.parse(fs.readFileSync('./data/external/badwords-master/array.json'));
const sanitize = require('sanitize-filename');
const express = require('express');
const mongodb = require('mongodb');
const firebaseStorage = require('firebase/storage');
const path = require('node:path');

const NodeCache = require('node-cache');

const index = require('../index');

router.use(express.text({limit: '150mb'}));

router.use(express.urlencoded({extended: false}));

const imageMetadataTemplate = {
     _id: 'undefined',
     internalPathRef: '/images/undefined.jpg',
     takenBy: {
          id: '0',
          nickname: 'DEVTEST',
          username: 'devtest'
     },
     takenInRoomId: '0',
     others: [ '0' ],
     room: {
          id: '0',
          creator: '0',
          name: 'Apartment'
     },
     infoPath: '/img/0/info',
     filePath: '/img/0',
     takenOn: {
          unixTimestamp: 0000000000,
          humanReadable: 'Thu, 01 Jan 1970'
     },
     social: {
          comments: [],
          votes: 0,
          tags: [
               'photo'
          ]
     }
}



// 24 hour cache
const imgCache = new NodeCache({
     "deleteOnExpire": true,
     "stdTTL": 60 * 60 * 8
});

router.post("/upload", middleware.authenticateToken, async (req, res) => {
     try {
          var {others, room_id, tags} = req.query;
          if(req.headers['content-type'] != 'text/plain' || typeof req.body == 'undefined') return res.status(400).send("You did not send encoded photo data.");
          if(typeof room_id !== 'string') return res.status(400).send("Room ID not specified.");
          if(typeof others !== 'string') others = '[]';
          if(typeof tags !== 'string') tags = '[ "photo" ]';

          var timestamp = Date.now();
          var TakenByData = helpers.PullPlayerData(req.user.id);

          const db = require('../index').mongoClient.db(process.env.MONGOOSE_DATABASE_NAME);
          var collection = db.collection("configuration");

          var doc = await collection.findOne({_id: 'ImageCount'});

          var MetaData = imageMetadataTemplate;
          MetaData._id = doc.count + 1;

          MetaData.takenBy.id = req.user.id;
          MetaData.takenBy.nickname = TakenByData.public.nickname;
          MetaData.takenBy.username = TakenByData.public.username;

          MetaData.takenOn.unixTimestamp = timestamp;
          MetaData.takenOn.humanReadable = new Date(timestamp).toUTCString();

          // TODO room implementation with photos

          MetaData.others = JSON.parse(others);
          MetaData.internalPathRef = `/images/${MetaData._id}.jpg`;
          MetaData.infoPath = `/img/${MetaData._id}/info`;
          MetaData.filePath = `/img/${MetaData._id}`;

          MetaData.social.tags = JSON.parse(tags);

          // Push metadata to MongoDB
          
          collection.updateOne({_id: 'ImageCount'}, {$set: {count: MetaData._id}});

          // Switch to the Images collection.
          collection = db.collection("images");

          collection.insertOne(MetaData);

          // Parse image
          const buff = Buffer.from(req.body, 'base64');


          // Upload image to firebase.
          const storage = firebaseStorage.getStorage();
          const ref = firebaseStorage.ref(storage, MetaData.internalPathRef);
          firebaseStorage.uploadBytes(ref, buff);

          helpers.auditLog(`Image with ID ${MetaData._id} has been uploaded to the API. Moderator intervention advised to ensure SFW.\nPERMALINK:\nhttps://api.compensationvr.tk/img/${MetaData._id}`, true);

          // Finalize request
          res.status(200).send("Successfully uploaded image.");
     } catch (ex) {
          res.sendStatus(500);
          throw ex;
     }
});

router.get("/:id/info", async (req, res) => {
     var {id} = req.params;
     if(typeof id !== 'string') return res.status(400).send("You did not specify an image ID.");
     id = sanitize(id);
     try {
          id = parseInt(id);
          if(id < 1) return res.status(400).send("Image ID is never below 0.");
     } catch {
          return res.status(400).send("Failed to parse image ID to integer, please try again with a valid URL-Encoded int.");
     }

     const db = require('../index').mongoClient.db(process.env.MONGOOSE_DATABASE_NAME);
     var collection = db.collection("images");

     try {
          var doc = await collection.findOne({_id: id});
          return res.status(200).json(doc);
     } catch (ex) {
          console.error(ex);
          return res.status(500).send("Failed to retrieve image data.");
     }
});

router.get("/:id", async (req, res) => {
     try {
          // Setup of parameters
          var {id} = req.params;
          var {base64} = req.query;

          // Guard Clauses
          if(typeof id !== 'string') return res.status(400).send({message:"You did not specify an image ID."});
          else try {
               id = parseInt(id);

               if(isNaN(id)) return res.status(400).send({message: "Invalid image ID specified."});
               if(id < 1) return res.status(400).send({message: "Image IDs are never below 0."});
          } catch {
               return res.status(500).send({message: "Failed to parse image ID."});
          }

          // Open database
          const db = require('../index').mongoClient.db(process.env.MONGOOSE_DATABASE_NAME);

          // Validate collection
          var collection = db.collection("configuration");
          const ImageCount = await collection.findOne({_id: "ImageCount"});

          if(id > ImageCount.count) return res.status(404).send({message: "The database does not contain that many images."});

          // Switch collection to image data.
          collection = db.collection("images");

          var ImageInfo = await collection.findOne({_id: id});

          if (typeof base64 === 'undefined' || base64 !== 'true') {
               var ImageBuffer;

               if(!imgCache.has(id)) {
                    const storage = firebaseStorage.getStorage();
                    const ref = firebaseStorage.ref(storage, ImageInfo.internalPathRef);

                    var ImageBytes = await firebaseStorage.getBytes(ref);
                    ImageBuffer = Buffer.from(ImageBytes);
               } else {
                    ImageBuffer = imgCache.get(id);
               }
               
               res.writeHead(200, {
                    'Content-Type': 'image/jpeg',
                    'Content-Length': ImageBuffer.length
               });
               res.end(ImageBuffer);

               if(!imgCache.has(id)) {
                    imgCache.set(id, ImageBuffer);
                    console.log(`Request submitted for uncached image ${id}, cached.`);
               } else console.log(`Request submitted for cached image ${id}.`);
          } else {
               var ImageBuffer;
               if(!imgCache.has(id)) {
                    const storage = firebaseStorage.getStorage();
                    const ref = firebaseStorage.ref(storage, ImageInfo.internalPathRef);

                    ImageBuffer = await firebaseStorage.getBytes(ref);
               } else {
                    ImageBuffer = imgCache.get(id);
               }
               var ImageBase64String = Buffer.from(ImageBuffer).toString('base64');

               res.status(200).contentType('text/plain').send(ImageBase64String);
               if(!imgCache.has(id)) {
                    imgCache.set(id, ImageBuffer);
                    console.log(`Request submitted for uncached image ${id}, cached.`);
               } else console.log(`Request submitted for cached image ${id}.`);
          }
     } catch (ex) {
          console.error(ex);
          return res.status(500).send("Failed to retrieve image.");
     }
});

module.exports = router;