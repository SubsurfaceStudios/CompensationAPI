const router = require('express').Router();
const helpers = require('../helpers');
const middleware = require('../middleware');
const uuid = require('uuid');

const message_template = {
    _id: "aaaa-bbbb-cccc-dddd-0000",
    author: "0",
    content: "wah wah wah",
    server: "aaaa-bbbb-cccc-dddd-0000",
    channel: "aaaa-bbbb-cccc-dddd-0000",
    posted_at: 2147483647
};

router.route("/channels/:channel_id/messages")
    .get(middleware.authenticateToken, async (req, res) => {
        try {
            const client = require('../index').mongoClient;

            var {count, offset} = req.query;
            count = parseInt(count);
            if(typeof count !== 'number' || count > 50 || isNaN(count)) count = 50;
            offset = parseInt(offset);
            if(typeof offset !== 'number' || isNaN(offset)) offset = 0;

            const {channel_id} = req.params;

            const db = client.db(process.env.MONGOOSE_DATABASE_NAME);
            var collection = db.collection("channels");

            const channel = await collection.findOne({'_id': {$exists: true, $eq: channel_id}});
            if(channel === null) return res.status(404).send({message: "channel_not_found"});

            collection = db.collection("servers");

            // this will be used in the future.
            // eslint-disable-next-line no-unused-vars
            const server = await collection.findOne({'_id': channel.server_id});

            //#region handling of permissions

            const player_data = await helpers.PullPlayerData(req.user.id);
            if(!player_data.private.messaging_servers.includes(channel.server_id)) return res.status(400).send({message: "not_in_server"});

            // TODO permission implementation, for now the only permission is "administrator".

            //#endregion
			
            // yes, this is dumb
            // deal with it
            if(channel.messages.length === 0) return res.status(200).send([]);

            var discrepency = -(channel.messages.length - (count + offset));

            if(count - discrepency < 1) return res.status(400).send({message: "not_enough_messages"});

            if(channel.messages.length < count + offset) count -= discrepency;

            collection = db.collection("messages");
            var send = [];
            for (let index = offset; index < offset + count; index++) {
                const message = await collection.findOne({_id: {$exists: true, $eq: channel.messages[index]}});
                if(message !== null) send.push(message);
                else {
                    helpers.auditLog(`ah fuck yea the fuckin servers r broken again <@533872282393903105> go fuckin fix it dumbass`, true);
                    continue;
                }
            }

            res.status(200).json(send);
        } catch (ex) {
            res.sendStatus(500);
            throw ex;
        }
    })
    .put(middleware.authenticateToken, async (req, res) => {
        try {
            const client = require('../index').mongoClient;
	
            const {content} = req.body;
            if(typeof content !== 'string') return res.status(400).send({message: "invalid_message_content"});
            const {channel_id} = req.params;
	
            const db = client.db(process.env.MONGOOSE_DATABASE_NAME);
            var collection = db.collection("channels");
	
            const channel = await collection.findOne({'_id': {$exists: true, $eq: channel_id}});
            if(channel === null) return res.status(404).send({message: "channel_not_found"});
	
            collection = db.collection("servers");

            // TODO implement permissions
            // eslint-disable-next-line no-unused-vars
            const server = await collection.findOne({'_id': channel.server_id});
	
            //#region handling of permissions
	
            const player_data = await helpers.PullPlayerData(req.user.id);
            if(!player_data.private.messaging_servers.includes(channel.server_id)) return res.status(400).send({message: "not_in_server"});
	
            // TODO permission implementation, for now the only permission is "administrator".
	
            //#endregion
	
            var message = message_template;
            message._id = uuid.v1();
            message.author = req.user.id;
            message.content = content;
            message.server = channel.server_id;
            message.channel = channel_id;
            message.posted_at = Date.now();
	
            collection = db.collection("messages");
	
            collection.insertOne(message);

            collection = db.collection("channels");
            channel.messages.push(message._id);
            collection.replaceOne({_id: channel_id}, channel);
	
            res.status(200).json({message_id: message._id});

            require('../index').MessagingGatewayServerV1.clients.forEach(client => {
                client.emit('message_sent', message.server, message.channel, message._id);
            });
        } catch (ex) {
            res.sendStatus(500);
            throw ex;
        }
    });

router.route("/channels/:channel_id/info")
    .get(middleware.authenticateToken, async (req, res) => {
        const {channel_id} = req.params;

        const client = require('../index').mongoClient;
        const db = client.db(process.env.MONGOOSE_DATABASE_NAME);
        var collection = db.collection("channels");

        const channel = await collection.findOne({'_id': {$exists: true, $eq: channel_id}});
        if(channel === null) return res.status(404).send({message: "channel_not_found"});

        collection = db.collection("servers");

        // TODO implement permissions
        // eslint-disable-next-line no-unused-vars
        const server = await collection.findOne({'_id': channel.server_id});

        //#region handling of permissions

        const player_data = await helpers.PullPlayerData(req.user.id);
        if(!player_data.private.messaging_servers.includes(channel.server_id)) return res.status(400).send({message: "not_in_server"});

        // TODO permission implementation, for now the only permission is "administrator".

        //#endregion

        var channel_info = {
            _id: channel._id,
            name: channel.name,
            description: channel.description,
            server_id: channel.server_id,
        };

        res.status(200).json(channel_info);
    });

router.route("/messages/:message_id")
    .get(middleware.authenticateToken, async (req, res) => {
        try {
            const client = require('../index').mongoClient;

            const {message_id} = req.params;

            const db = client.db(process.env.MONGOOSE_DATABASE_NAME);
            var collection = db.collection("messages");

            const message = await collection.findOne({'_id': {$exists: true, $eq: message_id}});
            if(message === null) return res.status(404).send({message: "message_not_found"});

            collection = db.collection("servers");

            // TODO implement permissions
            // eslint-disable-next-line no-unused-vars
            const server = await collection.findOne({'_id': {$exists: true, $eq: message.server}});

            //#region handling of permissions

            const player_data = await helpers.PullPlayerData(req.user.id);
            if(!player_data.private.messaging_servers.includes(message.server)) return res.status(400).send({message: "not_in_server"});

            // TODO permission implementation, for now the only permission is "administrator".

            //#endregion

            return res.status(200).json(message);
        } catch (ex) {
            res.sendStatus(500);
            throw ex;
        }
    })
    .patch(middleware.authenticateToken, async (req, res) => {
        try {
            const client = require('../index').mongoClient;

            const {content} = req.body;
            if(typeof content !== 'string') return res.status(400).send({message: "invalid_message_content"});

            const {message_id} = req.params;

            const db = client.db(process.env.MONGOOSE_DATABASE_NAME);
            var collection = db.collection("messages");

            const message = await collection.findOne({'_id': {$exists: true, $eq: message_id}});
            if(message === null) return res.status(404).send({message: "message_not_found"});

            collection = db.collection("servers");

            // TODO implement permissions
            // eslint-disable-next-line no-unused-vars
            const server = await collection.findOne({'_id': {$exists: true, $eq: message.server}});

            //#region handling of permissions

            const player_data = await helpers.PullPlayerData(req.user.id);
            if(!player_data.private.messaging_servers.includes(message.server)) return res.status(400).send({message: "not_in_server"});
			
            if(message.author !== req.user.id) return res.status(400).send({message: "not_message_author"});

            // TODO permission implementation, for now the only permission is "administrator".

            //#endregion

            collection = db.collection("messages");

            message.content = content;

            collection.replaceOne({_id: {$eq: message_id}}, message);

            res.sendStatus(200);

            require('../index').MessagingGatewayServerV1.clients.forEach(client => {
                client.emit('message_edited', message.server, message.channel, message._id);
            });
        } catch (ex) {
            res.sendStatus(500);
            throw ex;
        }
    })
    .delete(middleware.authenticateToken, async (req, res) => {
        try {
            const client = require('../index').mongoClient;

            const {message_id} = req.params;

            const db = client.db(process.env.MONGOOSE_DATABASE_NAME);
            var collection = db.collection("messages");

            const message = await collection.findOne({'_id': {$exists: true, $eq: message_id}});
            if(message === null) return res.status(404).send({message: "message_not_found"});

            collection = db.collection("servers");

            // TODO implement permissions
            // eslint-disable-next-line no-unused-vars
            const server = await collection.findOne({'_id': {$exists: true, $eq: message.server}});

            //#region handling of permissions

            const player_data = await helpers.PullPlayerData(req.user.id);
            if(!player_data.private.messaging_servers.includes(message.server)) return res.status(400).send({message: "not_in_server"});

            if(message.author !== req.user.id && !req.user.developer) return res.status(400).send({message: "not_message_author"});

            collection = db.collection("messages");
            collection.deleteOne({_id: {$eq: message_id}});

            collection = db.collection("channels");

            var channel = await collection.findOne({_id: {$eq: message.channel}});

            channel.messages.splice(channel.messages.findIndex(item => item === message_id), 1);

            collection.updateOne({_id: {$eq: message.channel}}, {$set: {messages: channel.messages}});

            res.sendStatus(200);

            require('../index').MessagingGatewayServerV1.clients.forEach(client => {
                client.emit('message_deleted', message.server, message.channel, message._id);
            });
        } catch (ex) {
            res.sendStatus(500);
            throw ex;
        }
    });

router.route("/servers/:server_id/channels")
    .get(middleware.authenticateToken, async (req, res) => {
        try {
            const {server_id} = req.params;

            const client = require('../index').mongoClient;

            const db = client.db(process.env.MONGOOSE_DATABASE_NAME);

            const server_collection = db.collection("servers");

            const server_data = await server_collection.findOne({_id: {$eq: server_id, $exists: true}});
            if(server_data === null) return res.status(404).send({message: "server_not_found"});

            const player_data = await helpers.PullPlayerData(req.user.id);
            if(!player_data.private.messaging_servers.includes(server_id)) return res.status(400).send({message: "not_in_server"});

            return res.status(200).json(server_data.channels);
        } catch (ex) {
            res.sendStatus(500);
            throw ex;
        }
    })
    .put(middleware.authenticateDeveloperToken, async (req, res) => {
        // TODO creating channels

        return res.sendStatus(501);
    });

router.route("/servers/:server_id/name")
    .get(middleware.authenticateToken, async (req, res) => {
        const {server_id} = req.params;

        const client = require('../index').mongoClient;
        const db = client.db(process.env.MONGOOSE_DATABASE_NAME);

        const server_collection = db.collection("servers");

        const server_data = await server_collection.findOne({_id: {$eq: server_id, $exists: true}});
        if(server_data === null) return res.status(404).send({message: "server_not_found"});

        const player_data = await helpers.PullPlayerData(req.user.id);
        if(!player_data.private.messaging_servers.includes(server_id)) return res.status(400).send({message: "not_in_server"});

        return res.status(200).send(server_data.name);
    });

router.route("/servers/:server_id/description")
    .get(middleware.authenticateToken, async (req, res) => {
        const {server_id} = req.params;

        const client = require('../index').mongoClient;
        const db = client.db(process.env.MONGOOSE_DATABASE_NAME);

        const server_collection = db.collection("servers");

        const server_data = await server_collection.findOne({_id: {$eq: server_id, $exists: true}});
        if(server_data === null) return res.status(404).send({message: "server_not_found"});

        const player_data = await helpers.PullPlayerData(req.user.id);
        if(!player_data.private.messaging_servers.includes(server_id)) return res.status(400).send({message: "not_in_server"});

        return res.status(200).json(server_data.description);
    });

router.route("/servers/:server_id/users")
    .get(middleware.authenticateToken, async (req, res) => {
        const {server_id} = req.params;
        const client = require('../index').mongoClient;

        const db = client.db(process.env.MONGOOSE_DATABASE_NAME);
        const server_collection = db.collection("servers");

        const server_data = await server_collection.findOne({_id: {$eq: server_id, $exists: true}});
        if(server_data === null) return res.status(404).send({message: "server_not_found"});

        const player_data = await helpers.PullPlayerData(req.user.id);
        if(!player_data.private.messaging_servers.includes(server_id)) return res.status(400).send({message: "not_in_server"});

        return res.status(200).json(Object.keys(server_data.users));
    });

router.route("/servers/:server_id/icon_id")
    .get(middleware.authenticateToken, async (req, res) => {
        const {server_id} = req.params;
        const client = require('../index').mongoClient;

        const db = client.db(process.env.MONGOOSE_DATABASE_NAME);
        const server_collection = db.collection("servers");

        const server_data = await server_collection.findOne({_id: {$eq: server_id, $exists: true}});
        if(server_data === null) return res.status(404).send({message: "server_not_found"});

        const player_data = await helpers.PullPlayerData(req.user.id);
        if(!player_data.private.messaging_servers.includes(server_id)) return res.status(400).send({message: "not_in_server"});

        return res.status(200).send(server_data.icon_id);
    });

router.route("/servers/mine")
    .get(middleware.authenticateToken, async (req, res) => {
        const data = await helpers.PullPlayerData(req.user.id);
        return res.status(200).json(data.private.messaging_servers);
    });

module.exports = {
    router: router
};