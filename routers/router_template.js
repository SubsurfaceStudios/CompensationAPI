const router = require('express').Router();
const helpers = require('../helpers');
const middleware = require('../middleware');
const fs = require('fs');
const BadWordList = JSON.parse(fs.readFileSync('../data/external/badwords-master/array.json'));
const sanitize = require('sanitize-filename');


module.exports = router;