const router = require('express').Router();
const helpers = require('../helpers');
const middleware = require('../middleware');
const BadWordList = JSON.parse(require('../data/external/badwords-master/array.json'));
const sanitize = require('sanitize-filename');


router.get("/accountCount", async (req, res) => {
     var files = fs.readdirSync("data/accounts");
     res.status(200).send(`${files.length - 1}`);
});

module.exports = router;