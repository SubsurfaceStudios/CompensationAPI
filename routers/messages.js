const router = require('express').Router();
const helpers = require('../helpers');
const middleware = require('../middleware');
const uuid = require('uuid');

const {ObjectId} = require('mongodb');



const message_template = {
     _id: "",
     author: "0",
     content: "wah wah wah",
     server: "aaaa-bbbb-cccc-dddd-0000",
     channel: "aaaa-bbbb-cccc-dddd-0000",
     posted_at: 2147483647
};

router.route("/channels/:channel_id/messages")
     .get(middleware.authenticateDeveloperToken, async (req, res) => {
		try {
			const client = require('../index').mongoClient;

			var {count, offset} = req.body;
			if(typeof count !== 'number' || count > 50) count = 50;
			if(typeof offset !== 'number') offset = 0;

			const {channel_id} = req.params;

			const db = client.db(process.env.MONGOOSE_DATABASE_NAME);
			var collection = db.collection("channels");

			const channel = await collection.findOne({'_id': {$exists: true, $eq: channel_id}});
			if(channel == null) return res.status(404).send({message: "channel_not_found"});

			collection = db.collection("servers");
			const server = await collection.findOne({'_id': channel.server_id});

			//#region handling of permissions

			if(!Object.keys(server.users).includes(req.user.id)) return res.status(400).send({message: "not_in_server"});

			// TODO permission implementation, for now the only permission is "administrator".

			//#endregion
			
			var discrepency = -(channel.messages.length - (count + offset));

			if(count - discrepency < 1) return res.status(400).send({message: "not_enough_messages"});

			count -= discrepency;

			collection = db.collection("messages");
			var send = [];
			for (let index = offset; index < offset + count; index++) {
				const message = await collection.findOne({_id: {$exists: true, $eq: channel.messages[index]}});
				send.push(message);
			}

			res.status(200).json(send);
		} catch (ex) {
			res.sendStatus(500);
			throw ex;
		}
     })
     .put(middleware.authenticateDeveloperToken, async (req, res) => {
		try {
			const client = require('../index').mongoClient;
	
			const {content} = req.body;
			if(typeof content !== 'string') return res.status(400).send({message: "invalid_message_content"});
			const {channel_id} = req.params;
	
			const db = client.db(process.env.MONGOOSE_DATABASE_NAME);
			var collection = db.collection("channels");
	
			const channel = await collection.findOne({'_id': {$exists: true, $eq: channel_id}});
			if(channel == null) return res.status(404).send({message: "channel_not_found"});
	
			collection = db.collection("servers");
			const server = await collection.findOne({'_id': channel.server_id});
	
			//#region handling of permissions
	
			if(!Object.keys(server.users).includes(req.user.id)) return res.status(400).send({message: "not_in_server"});
	
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
	
			return res.sendStatus(200);
		} catch (ex) {
			res.sendStatus(500);
			throw ex;
		}
     });

router.route("/messages/:message_id")
     .get(middleware.authenticateDeveloperToken, async (req, res) => {
          return res.sendStatus(501);
     })
     .patch(middleware.authenticateDeveloperToken, async (req, res) => {
          return res.sendStatus(501);
     })
     .delete(middleware.authenticateDeveloperToken, async (req, res) => {
          return res.sendStatus(501);
     });

module.exports = {
     router: router
};