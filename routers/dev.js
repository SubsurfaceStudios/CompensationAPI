const router = require('express').Router();
const helpers = require('../helpers');
const middleware = require('../middleware');
const fs = require('fs');
const BadWordList = JSON.parse(fs.readFileSync('./data/external/badwords-master/array.json'));
const sanitize = require('sanitize-filename');

//Check if a token is valid as developer.
router.get("/check", middleware.authenticateDeveloperToken, async (req, res) => {
     return res.status(200).send("This token is verified as Developer.");
});

router.post("/play-sound", middleware.authenticateDeveloperToken, async (req, res) => {
     var {url} = req.body;
     if(typeof url !== 'string') return res.status(400).send("You failed to specify a URL!");

     var count = helpers.getAccountCount();
     for (let index = 0; index < count; index++) {
          require('../index').sendStringToClient(index, `PLAY_SOUND ${url}`);
     }

     res.sendStatus(200);
});

router.post("/stop-sounds", middleware.authenticateDeveloperToken, async (req, res) => {
     var count = helpers.getAccountCount();
     for (let i = 0; i < count; i++) {
          require('../index').sendStringToClient(index, "STOP_SOUND")
     }

     res.sendStatus(200);
});

module.exports = router;