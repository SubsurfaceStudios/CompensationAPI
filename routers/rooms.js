const router = require('express').Router();
const helpers = require('../helpers');
const middleware = require('../middleware');
const fs = require('fs');
const BadWordList = JSON.parse(fs.readFileSync('./data/external/badwords-master/array.json'));
const sanitize = require('sanitize-filename');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const OncePerHour = new rateLimit.rateLimit({
     "windowMs": 1 * 60 * 60 * 1000,
     "max": 1,
     "message": "This endpoint is limited to only 1 request per hour. Please try again in 60 minutes.",
     "standardHeaders": true,
     "legacyHeaders": true
});

router.post("/create", middleware.authenticateDeveloperToken, async (req, res) => {
     try {
          return res.sendStatus(501);
     } catch {
          return res.sendStatus(500);
     }
});



module.exports = router;