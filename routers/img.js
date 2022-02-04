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

router.post("/upload", middleware.authenticateToken, async (req, res) => {
     try { 
          var {others, roomId, tags} = req.query;
          if(req.headers['content-type'] !== 'text/plain' || typeof req.body !== 'string') return res.status(400).send("You did not send encoded photo data.");
          if(typeof roomId !== 'string') return res.status(400).send("Room ID not specified.");
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


          // Finalize request
          res.status(200).send("Successfully uploaded image.");
     } catch (ex) {
          // Error handling
          console.error(ex);
          res.status(500).send("Failed to upload image.");
     }
});

router.get("/:id/info", async (req, res) => {
     var {id} = req.params;
     if(typeof id !== 'string') return res.status(400).send("You did not specify an image ID.");
     id = sanitize(id);

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
     var {id} = req.params;
     var {base64} = req.query;
     if(typeof id !== 'string') return res.status(400).send("You did not specify an image ID.");
     id = sanitize(id);
     id = parseInt(id);

     const db = require('../index').mongoClient.db(process.env.MONGOOSE_DATABASE_NAME);
     var collection = db.collection("images");

     try {
          var ImageMetaData = await collection.findOne({_id: id});
          
          const storage = firebaseStorage.getStorage();
          const ref = firebaseStorage.ref(storage, ImageMetaData.internalPathRef);

          if (typeof base64 === 'undefined') {
               var ImageBuffer = await firebaseStorage.getBytes(ref);
               fs.writeFileSync(`data/cache/${id}.jpg`, Buffer.from(ImageBuffer));
               res.status(200).sendFile(path.resolve(`data/cache/${id}.jpg`));

               // Clear the file from cache later
               setTimeout(() => fs.rmSync(`data/cache/${id}.jpg`), 1000);
          } else {
               var ImageBuffer = await firebaseStorage.getBytes(ref);
               var ImageBase64String = Buffer.from(ImageBuffer).toString('base64');
               res.status(200).contentType('text/plain').send(ImageBase64String);
          }

          
     } catch (ex) {
          console.error(ex);
          return res.status(500).send("Failed to retrieve image.");
     }
});

module.exports = router;