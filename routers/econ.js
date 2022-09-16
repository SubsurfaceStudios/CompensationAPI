const router = require('express').Router();
const helpers = require('../helpers');
const middleware = require('../middleware');

router.route("/item/:id/info")
    .get(async (req, res) => {
        // Learned my lesson on this one thanks CodeQL
        var {id} = req.params;

        var data = await PullItem(id);
        if(data === null) return res.sendStatus(404);

        return res.status(200).json(data);
    })
    .post(middleware.authenticateDeveloperToken, async (req, res) => {
        var {id} = req.params;

        try {
            await PushItem(id, req.body);
            return res.sendStatus(200);
        } catch (ex) {
            res.sendStatus(500);
            throw ex;
        }
    })
    .put(middleware.authenticateDeveloperToken, async (req, res) => {
        var id = await require('../index')
            .mongoClient
            .db(process.env.MONGOOSE_DATABASE_NAME)
            .collection('items')
            .countDocuments({});
        await PushItem(id.toString(), req.body);
        res.status(200).send();
    });

router.post("/item/buy", middleware.authenticateToken, async (req, res) => {
    //i should have been doing this before tbh
    //type confusion is a pain
    var {item_id} = req.body;
    if(typeof item_id == 'undefined') return res.status(400).send("You did not specify an item.");
    if(typeof item_id != 'string') return res.status(400).send("The item ID you specified must be a string.");

    var player_balance = await GetPlayerCurrency(req.user.id);

    var item = await PullItem(item_id);
    if(item === null) return res.status(404).send("That item does not exist!");

    if(!item.is_purchasable) return res.status(400).send("That item is not available for purchase.");
    if(player_balance < item.buy_price) return res.status(400).send("You cannot afford that item!");

    try {
        await GrantPlayerItem(req.user.id, item_id);
        await ModifyPlayerCurrency(req.user.id, 0 - item.buy_price);
        return res.status(200).send("Successfully purchased item! Enjoy!");
    } catch (ex) {
        res.status(500).send("Failed to purchase item due to an internal server error. Please contact Rose932#1454 on Discord for more information.");
        throw ex;
    }
});

router.post("/item/gift", middleware.authenticateToken, async (req, res) => {
    var {item_id, target} = req.body;
    if(typeof item_id != 'string') return res.status(400).send("You did not specify an item.");
    if(typeof target != 'string') return res.status(400).send("You did not specify a user to gift this item.");

    var data = await helpers.PullPlayerData(target);
    if(data === null) return res.status(404).send("That player does not exist!");
	
    var item = await PullItem(item_id);
    if(item === null) return res.status(404).send("That item does not exist!");

    if(!item.is_purchasable) return res.status(400).send("That item is not purchasable in any capacity.");
    if(!item.is_giftable) return res.status(400).send("You cannot gift somebody this item.");

    var balance = await GetPlayerCurrency(req.user.id);
    if(balance < item.gift_price) return res.status(400).send("You cannot afford that item.");

    try {
        await GrantPlayerItem(target, item_id);
        await ModifyPlayerCurrency(req.user.id, 0 - item.gift_price);
        return res.status(200).send("Gift successfully sent! Thanks for playing Compensation VR!");
    } catch (ex) {
        res.status(500).send("Internal server error, failed to send gift. Contact Rose932#1454 on Discord for more information.");
        throw ex;
    }
});

router.post("/item/refund", middleware.authenticateToken, async (req, res) => {
    var {item_id} = req.body;
    if(typeof item_id != 'string') return res.status(400).send("You did not specify an item.");

    var item = await PullItem(item_id);
    if(item === null) return res.status(404).send("That item does not exist!");
    if(!item.is_refundable) return res.status(400).send("You cannot refund that item!");

    var count = await GetPlayerItemCount(req.user.id, item_id);
    if(count < 1) return res.status(400).send("You do not own that item. >:(");

    try {
        await ModifyPlayerCurrency(req.user.id, item.refund_price);
        await SubtractPlayerItem(req.user.id, item_id);
        return res.status(200).send("Transaction complete. Thank you for playing Compensation VR!");
    } catch (ex) {
        res.status(500).send("An error occurred and we failed to complete the transaction. Please contact Rose932#1454 on Discord for more information.");
        throw ex;
    }
});

router.post("/item/transfer", middleware.authenticateToken, async (req, res) => {
    var {item_id, target} = req.body;
    if(typeof item_id != 'string') return res.status(400).send("You did not specify an item.");
    if(typeof target != 'string') return res.status(400).send("You did not specify a user.");

    var item = await PullItem(item_id);
    if(item === null) return res.status(404).send("That item does not exist!");
    if(!item.is_transferrable) return res.status(400).send("That item cannot be transferred.");

    var count = await GetPlayerItemCount(item_id);
    if(count < 1) return res.status(400).send("You do not own that item!");

    var data = await helpers.PullPlayerData(target);
    if(data === null) return res.status(404).send("That user does not exist!");


    try {
        await GrantPlayerItem(target, item_id);
        await SubtractPlayerItem(req.user.id, item_id);
        return res.status(200).send("Item transferred. Thanks for playing Compensation VR!");
    } catch (ex) {
        res.status(500).send("We encountered an error and the transaction could not be completed. Please contact Rose932#1454 on Discord for more information.");
        throw ex;
    }
});

router.post("/currency/transfer", middleware.authenticateToken, async (req, res) => {
    var {amount, target} = req.body;
    if(typeof amount != 'number') return res.status(400).send("Amount must be an integer!");
    if(typeof target != 'string') return res.status(400).send("You did not specify a user!");
    if(amount < 1) return res.status(400).send("You can't take money from somebody! That's illegal!");

    var data = await helpers.PullPlayerData(target);
    if(data === null) return res.status(404).send("That user does not exist!");

    var balance = await GetPlayerCurrency(req.user.id);
    if(balance < amount) return res.status(400).send("You don't have enough currency to send that much!");

    try {
        await ModifyPlayerCurrency(req.user.id, 0 - amount);
        await ModifyPlayerCurrency(target, amount);
        return res.status(200).send("Currency successfully transferred! Thanks for playing Compensation VR!");
    } catch (ex) {
        res.status(500).send("An error occured and we couldn't transfer the currency. Please contact Rose932#1454 on Discord for more information.");
        throw ex;
    }
});

router.get("/item/all", async (req, res) => {
    const client = require('../index.js').mongoClient;
    const list = 
		await client.db(process.env.MONGOOSE_DATABASE_NAME)
            .collection("items")
            .find({})
            .toArray();

    let items = {};
    for(var i = 0; i < list.length; i++) {
        items[list[i].id] = list[i];
    }
    res.status(200).json(items);
});

router.get("/inventory", middleware.authenticateToken, async (req, res) => {
    var data = await helpers.PullPlayerData(req.user.id);
    return res.status(200).json(data.econ.inventory);
});

router.get("/currency/balance", middleware.authenticateToken, async (req, res) => {
    return res.status(200).send((await GetPlayerCurrency(req.user.id)).toString());
});

router.post("/item/equip", middleware.authenticateToken, async (req, res) => {
    var {item_id} = req.body;
	
    if(typeof item_id != 'string') return res.status(400).send("You did not specify an item ID!");

    var itemData = await PullItem(item_id);
    if(itemData === null) return res.status(404).send("That item does not exist!");
    if(!itemData.equippable) return res.status(400).send("That item is not equippable!");

    var count = await GetPlayerItemCount(req.user.id, item_id);
    if(count < 1) return res.status(400).send("You do not own that item!");

    try {
        var playerData = await helpers.PullPlayerData(req.user.id);
        playerData.public.outfit[itemData.use_slot] = item_id;
        await helpers.PushPlayerData(req.user.id, playerData);

        return res.sendStatus(200);
    } catch {
        return res.sendStatus(500);
    }
});

router.get("/items/featured", async (req, res) => {
    try {
        let db = require('../index').mongoClient.db(process.env.MONGOOSE_DATABASE_NAME);
        let data = await db.collection('global').findOne({ _id: { $eq: "featured_items", $exists: true } });

        if (data == null || !Array.isArray(data?.data))
            return res.status(404).json({
                code: "misconfiguration",
                message: "An internal misconfiguration has occurred and we cannot serve the request. Please contact the development team ASAP to resolve the issue."
            });

        res.status(200).json(data);
    } catch (ex) {
        res.status(500).json({
            code: "internal_error",
            message: "An internal error occurred. Please let us know if the issue persists."
        });
        throw ex;
    }
});

//#region functions 

async function PullItem(id) {
    const db = require('../index').mongoClient.db(process.env.MONGOOSE_DATABASE_NAME);
    const item = db.collection('items').findOne({_id: {$eq: id, $exists: true}});
    return item;
}

async function PushItem(id, data) {
    const db = require('../index').mongoClient.db(process.env.MONGOOSE_DATABASE_NAME);
    const collection = db.collection('items');

    // replace the old item with the inputted data.
    const result = await collection.replaceOne({_id: {$eq: id, $exists: true}}, data);
    return result;
}

async function GrantPlayerItem(id, item_id) {
    var data = await helpers.PullPlayerData(id);
    if(data === null) return null;

    if(typeof data.econ.inventory[item_id] == 'undefined') data.econ.inventory[item_id] = 1;
    else data.econ.inventory[item_id] += 1;

    await helpers.PushPlayerData(id, data);
}

async function ModifyPlayerCurrency(id, amount) {
    var data = await helpers.PullPlayerData(id);
    if(data === null) return null;

    data.econ.currency += amount;

    if(data.econ.currency < 0) data.econ.currency = 0;

    await helpers.PushPlayerData(id, data);
}

async function GetPlayerItemCount(id, item_id) {
    var data = await helpers.PullPlayerData(id);
    if(data === null) return null;

    if(typeof data.econ.inventory[item_id] == 'undefined') return 0;
    else return data.econ.inventory[item_id];
}

async function SubtractPlayerItem(id, item_id) {
    var data = await helpers.PullPlayerData(id);
    if(data === null) return null;

    if(typeof data.econ.inventory[item_id] != 'number') data.econ.inventory[item_id] = 0;

    if(data.econ.inventory[item_id] >= 1) data.econ.inventory[item_id]--;
    else data.econ.inventory[item_id] = 0;

    await helpers.PushPlayerData(id, data);
}

async function GetPlayerCurrency(id) {
    var data = await helpers.PullPlayerData(id);
    if(data === null) return null;
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