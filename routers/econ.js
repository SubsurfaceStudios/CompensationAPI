const router = require('express').Router();
const helpers = require('../helpers');
const middleware = require('../middleware');
const fs = require('fs');
const sanitize = require('sanitize-filename');

router.route("/item/:id/info")
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
	})
	.put(middleware.authenticateDeveloperToken, async (req, res) => {
		id = fs.readdirSync('data/econ').length - 1;
		PushItem(id.toString(), req.body);
		res.status(200).send();
	});

router.post("/item/buy", middleware.authenticateToken, async (req, res) => {
	//i should have been doing this before tbh
	//type confusion is a pain
	var {item_id} = req.body;
	if(typeof item_id == 'undefined') return res.status(400).send("You did not specify an item.");
	if(typeof item_id !== 'string') return res.status(400).send("The item ID you specified must be a string.");
	item_id = sanitize(item_id);

	var player_balance = GetPlayerCurrency(req.user.id);

	var item = PullItem(item_id);
	if(item == null) return res.status(404).send("That item does not exist!");

	if(!item.is_purchasable) return res.status(400).send("That item is not available for purchase.");
	if(player_balance < item.buy_price) return res.status(400).send("You cannot afford that item!");

	try {
		GrantPlayerItem(req.user.id, item_id);
		ModifyPlayerCurrency(req.user.id, 0 - item.buy_price);
		return res.status(200).send("Successfully purchased item! Enjoy!");
	} catch (ex) {
		res.status(500).send("Failed to purchase item due to an internal server error. Please contact Rose932#1454 on Discord for more information.");
		console.error(ex);
	}
});

router.post("/item/gift", middleware.authenticateToken, async (req, res) => {
	var {item_id, target} = req.body;
	if(typeof item_id !== 'string') return res.status(400).send("You did not specify an item.");
	if(typeof target !== 'string') return res.status(400).send("You did not specify a user to gift this item.");

	item_id = sanitize(item_id);
	target = sanitize(target);

	var data = helpers.PullPlayerData(target);
	if(data == null) return res.status(404).send("That player does not exist!");
	
	var item = PullItem(item_id);
	if(item == null) return res.status(404).send("That item does not exist!");

	if(!item.is_purchasable) return res.status(400).send("That item is not purchasable in any capacity.");
	if(!item.is_giftable) return res.status(400).send("You cannot gift somebody this item.");

	var balance = GetPlayerCurrency(req.user.id);
	if(balance < item.gift_price) return res.status(400).send("You cannot afford that item.");

	try {
		GrantPlayerItem(target, item_id);
		ModifyPlayerCurrency(req.user.id, 0 - item.gift_price);
	} catch (ex) {
		res.status(500).send("Internal server error, failed to send gift. Contact Rose932#1454 on Discord for more information.");
		console.error(ex);
	}
});

router.post("/item/refund", middleware.authenticateToken, async (req, res) => {
	var {item_id} = req.body;
	if(typeof item_id !== 'string') return res.status(400).send("You did not specify an item.");

	item_id = sanitize(item_id);

	var item = PullItem(item_id);
	if(item == null) return res.status(404).send("That item does not exist!");
	if(!item.is_refundable) return res.status(400).send("You cannot refund that item!");

	var count = GetPlayerItemCount(item_id);
	if(count < 1) return res.status(400).send("You do not own that item. >:(");

	try {
		ModifyPlayerCurrency(req.user.id, item.refund_price);
		SubtractPlayerItem(req.user.id, item_id);
		return res.status(200).send("Transaction complete. Thank you for playing Compensation VR!");
	} catch (ex) {
		res.status(500).send("An error occurred and we failed to complete the transaction. Please contact Rose932#1454 on Discord for more information.");
		console.error(ex);
	}
});

router.post("/item/transfer", middleware.authenticateToken, async (req, res) => {
	var {item_id, target} = req.body;
	if(typeof item_id !== 'string') return res.status(400).send("You did not specify an item.");
	if(typeof target !== 'string') return res.status(400).send("You did not specify a user.");

	item_id = sanitize(item_id);
	target = sanitize(target);

	var item = PullItem(item_id);
	if(item == null) return res.status(404).send("That item does not exist!");
	if(!item.is_transferrable) return res.status(400).send("That item cannot be transferred.");

	var count = GetPlayerItemCount(item_id);
	if(count < 1) return res.status(400).send("You do not own that item!");

	var data = helpers.PullPlayerData(target);
	if(data = null) return res.status(404).send("That user does not exist!");


	try {
		GrantPlayerItem(target, item_id);
		SubtractPlayerItem(req.user.id, item_id);
		return res.status(200).send("Item transferred. Thanks for playing Compensation VR!");
	} catch (ex) {
		res.status(500).send("We encountered an error and the transaction could not be completed. Please contact Rose932#1454 on Discord for more information.");
		console.error(ex);
	}
});

router.post("/currency/transfer", middleware.authenticateToken, async (req, res) => {
	var {amount, target} = req.body;
	if(typeof amount !== 'number') return res.status(400).send("Amount must be an integer!");
	if(typeof target !== 'string') return res.status(400).send("You did not specify a user!");
	if(amount < 1) return res.status(400).send("You can't take money from somebody! That's illegal!");

	target = sanitize(target);

	var data = helpers.PullPlayerData(target);
	if(data == null) return res.status(404).send("That user does not exist!");

	var balance = GetPlayerCurrency(req.user.id);
	if(balance < amount) return res.status(400).send("You don't have enough currency to send that much!");

	try {
		ModifyPlayerCurrency(req.user.id, 0 - amount);
		ModifyPlayerCurrency(target, amount);
		return res.status(200).send("Currency successfully transferred! Thanks for playing Compensation VR!");
	} catch (ex) {
		res.status(500).send("An error occured and we couldn't transfer the currency. Please contact Rose932#1454 on Discord for more information.");
		console.error(ex);
	}
});

router.get("/item/all", async (req, res) => {
	var files = fs.readdirSync('data/econ');
	files = files.filter(item => item != "ITEM_TEMPLATE.json");
	var list = {};
	files.forEach((item) => {
		item = item.split(".")[0];
		data = PullItem(item);
		list[item] = data;
	});
	res.status(200).json(list);
});

router.get("/inventory", async (req, res) => {
	var data = helpers.PullPlayerData(req.user.id);
	return res.status(200).json(data.econ.inventory);
});

router.get("/currency/balance", middleware.authenticateToken, async (req, res) => {
	return res.status(200).send(GetPlayerCurrency(req.user.id).toString());
});

router.post("/item/:item_id/equip", middleware.authenticateToken, async (req, res) => {
	var {item_id} = req.params;
	
	if(typeof item_id !== 'string') return res.status(400).send("You did not specify an item ID!");
	
	var itemData = PullItem(item_id);
	if(itemData == null) return res.status(404).send("That item does not exist!");
	if(!itemData.equippable) return res.status(400).send("That item is not equippable!");

	var count = GetPlayerItemCount(item_id);
	if(count < 1) return res.status(400).send("You do not own that item!");

	try {
		var playerData = helpers.PullPlayerData(req.user.id);
		playerData.public.outfit[itemData.use_slot] = item_id;
		helpers.PushPlayerData(req.user.id, playerData);

		return res.sendStatus(200);
	} catch {
		return res.sendStatus(500);
	}
});

//#region functions 

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

	if(PullItem(item_id) == null) return null;

	var data = helpers.PullPlayerData(id);
	if(data == null) return null;

	if(typeof data.econ.inventory[item_id] == 'undefined') data.econ.inventory[item_id] = 1;
	else data.econ.inventory[item_id] += 1;

	helpers.PushPlayerData(id, data);
}

function ModifyPlayerCurrency(id, amount) {
	id = sanitize(id);

	var data = helpers.PullPlayerData(id);
	if(data == null) return null;

	data.econ.currency += amount;

	if(data.econ.currency < 0) data.econ.currency = 0;

	helpers.PushPlayerData(id, data);
}

function GetPlayerItemCount(id, item_id) {
	id = sanitize(id);

	var data = helpers.PullPlayerData(id);
	if(data == null) return null;

	if(typeof data.econ.inventory[item_id] == 'undefined') return 0;
	else return data.econ.inventory[item_id];
}

function SubtractPlayerItem(id, item_id) {
	id = sanitize(id);

	var data = helpers.PullPlayerData(id);
	if(data == null) return null; 

	if(PullItem(item_id) == null) return null;

	if(typeof data.econ.inventory[item_id] == 'undefined') data.econ.inventory[item_id] = 0;
	else data.econ.inventory[item_id] = data.econ.inventory[item_id] > 0 ? data.econ.inventory[item_id] - 1 : 0;

	helpers.PushPlayerData(id, data);
}

function GetPlayerCurrency(id) {
	id = sanitize(id);

	var data = helpers.PullPlayerData(id);
	if(data == null) return null;
	else return data.econ.currency;
}

//#endregion

module.exports = {
	router: router,
	PullItem: PullItem,
	PushItem: PushItem,
	GrantPlayerItem: GrantPlayerItem,
	GetPlayerItemCount: GetPlayerItemCount,
	SubtractPlayerItem: SubtractPlayerItem,
	ModifyPlayerCurrency: ModifyPlayerCurrency,
	GetPlayerCurrency: GetPlayerCurrency
};