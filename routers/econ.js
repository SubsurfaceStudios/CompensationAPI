const router = require('express').Router();
const helpers = require('../helpers');
const middleware = require('../middleware');
const fs = require('fs');
const BadWordList = JSON.parse(fs.readFileSync('./data/external/badwords-master/array.json'));
const sanitize = require('sanitize-filename');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

router.route("/item/:id")
	.get(async (req, res) => {
		// Learned my lesson on this one thanks CodeQL
		var {id} = req.params;
		id = sanitize(id);

		var data = PullItem(id);
		if(data == null) return res.sendStatus(404);

		return res.status(200).json(data);
	})
	.post(middleware.authenticateDeveloperToken, async (req, res) => {
		var {id} = req.params;
		id = sanitize(id);

		try {
			PushItem(id, req.body);
			return res.sendStatus(200);
		} catch (ex) {
			console.error(ex);
			return res.sendStatus(500);
		}
	});

function PullItem(id) {
	try {
		id = sanitize(id);
		var file = fs.readFileSync(`data/econ/${id}.json`);
		var object = JSON.parse(file);
		return object;
	} catch (ex) {
		console.error(ex);
		return null;
	}
}

function PushItem(id, data) {
	id = sanitize(id);
	var file = JSON.stringify(data, null, 5);
	fs.writeFileSync(`data/econ/${id}.json`, file);
}

function GrantPlayerItem(id, item_id) {
	id = sanitize(id);
	item_id = sanitize(item_id);

	if(PullItem(item_id) == null) return;

	var data = helpers.PullPlayerData(id);
	if(data == null) return;

	if(typeof data.econ.inventory[item_id] == 'undefined') data.econ.inventory[item_id] = 1;
	else data.econ.inventory[item_id] += 1;

	helpers.PushPlayerData(id, data);
}

module.exports = {
	router: router,
	PullItem: PullItem,
	PushItem: PushItem,
	GrantPlayerItem: GrantPlayerItem
};