const router = require('express').Router();
const fs = require('fs');
const { GetInstances } = require('./matchmaking');


router.get("/account-count", async (req, res) => {
     var files = fs.readdirSync("./data/accounts");
     res.status(200).send(`${files.length - 1}`);
});

router.get("/online-count", async (req, res) => {
     const clients = Object.keys(require('../index').getClients());
     res.status(200).send(`${clients.length}`);
});

router.get("/instance-count", async (req, res) => {
     const instances = await GetInstances("*");
     res.status(200).send(`${instances.length}`);
});

module.exports = router;
