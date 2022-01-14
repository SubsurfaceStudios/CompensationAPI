const router = require('express').Router();
const helpers = require('../helpers');
const middleware = require('../middleware');
const BadWordList = JSON.parse(require('../data/external/badwords-master/array.json'));
const sanitize = require('sanitize-filename');


module.exports = router;