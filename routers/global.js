const router = require('express').Router();
const helpers = require('../helpers');
const middleware = require('../middleware');
const fs = require('fs');
const BadWordList = JSON.parse(fs.readFileSync('../data/external/badwords-master/array.json'));
const sanitize = require('sanitize-filename');


router.route("/:key")
     .get(async (req, res) => {
          const { key } = req.params;
     
          const global = await JSON.parse(fs.readFileSync("./data/global/global.json"));
     
          if(!(key in global)) return res.status(404).send("ID not in global title data.");
     
          res.status(200).send(global[key]);
     })
     .post(middleware.authenticateDeveloperToken, async (req, res) => {
          const { key } = req.params;
          const { value } = req.body;
     
          var global = await JSON.parse(fs.readFileSync("./data/global/global.json"));
     
          global[key] = value;
     
          fs.writeFileSync("./data/global/global.json", JSON.stringify(global, null, "    "));
          helpers.auditLog(`!DEVELOPER ACTION! Developer ${req.user.username} with ID ${req.user.id} updated GLOBAL title data with key ${key}.`);
          res.status(200).send();
     });
     
module.exports = router;