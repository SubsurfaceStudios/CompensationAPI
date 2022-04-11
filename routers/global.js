const router = require('express').Router();
const helpers = require('../helpers');
const middleware = require('../middleware');
const fs = require('fs');
const BadWordList = JSON.parse(fs.readFileSync('./data/external/badwords-master/array.json'));
const sanitize = require('sanitize-filename');


router.route("/:key")
     .get(async (req, res) => {
          const { mongoClient } = require('../index');
          try {
               const { key } = req.params;
     
               const collection = mongoClient.db(process.env.MONGOOSE_DATABASE_NAME).collection("global");

               const doc = await collection.findOne({_id: key});

               return res.status(200).send(`${doc.data}`);
          } catch {
               res.sendStatus(404);
          }
     })
     .post(middleware.authenticateDeveloperToken, async (req, res) => {
          const { mongoClient } = require('../index');
          try {
               const { key } = req.params;
               const { value } = req.body;

               const collection = mongoClient.db(process.env.MONGOOSE_DATABASE_NAME).collection("global");

               collection.findOneAndUpdate({_id: key}, {data: value});

               return res.sendStatus(200);
          } catch (ex) {
               res.sendStatus(500);
               throw ex;
          }
     });

router.get("/config", async (req, res) => {
     const { mongoClient } = require('../index');
     try {
          const collection = mongoClient.db(process.env.MONGOOSE_DATABASE_NAME).collection("global");

          const doc = await collection.findOne({_id: {$eq: "config", $exists: true}});
          if(doc == null) return res.sendStatus(404);

          console.log(doc);
          return res.status(200).json(doc.data);
     } catch {
          res.sendStatus(500);
     }  
});
     
module.exports = router;