const router = require('express').Router();
const { GetInstances } = require('./matchmaking');


router.get("/account-count", async (req, res) => {
    const {mongoClient} = require('../index');
    const db = mongoClient.db(process.env.MONGOOSE_DATABASE_NAME);
    const size = await db.collection("accounts").countDocuments({});
    res.status(200).send(`${size}`);
});

router.get("/online-count", async (req, res) => {
    const clients = Object.keys(require('./ws/WebSocketServerV2').ws_connected_clients);
    res.status(200).send(`${clients.length}`);
});

router.get("/instance-count", async (req, res) => {
    const instances = await GetInstances(null);
    res.status(200).send(`${instances.length}`);
});

module.exports = router;
