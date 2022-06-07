const middleware = require('../../middleware');
const WebSocket = require('ws');
const { client, WebSocketV2_MessageTemplate } = require("../../index");

const MessagingGatewayServerV1 = new WebSocket.Server({ noServer: true });
exports.MessagingGatewayServerV1 = MessagingGatewayServerV1;
MessagingGatewayServerV1.on('connection', async (stream) => {
    var ClientData = {
        uid: null,
        username: "",
        nickname: "",
        isAuthenticated: false,
        tags: [],
        isDeveloper: false,
        isCreativeToolsBetaProgramMember: false
    };
    const db = client.db(process.env.MONGOOSE_DATABASE_NAME);
    const server_collection = db.collection("servers");
    const message_collection = db.collection("messages");

    stream.on('ping', async () => {
        stream.pong();
    });

    stream.on('message', async (data) => {
        try {
            var ParsedContent = JSON.parse(data.toString('utf-8'));
        } catch (ex) {
            var send = WebSocketV2_MessageTemplate;
            send.code = "throw_exception";
            send.data = {
                text: "json_parse_failed"
            };

            stream.send(send);
            throw ex;
        }

        if (typeof ParsedContent.code !== 'string' || typeof ParsedContent.data !== 'object')
            return;

        // begin parsing data
        switch (ParsedContent.code) {
        case "authenticate":
            if (ClientData.isAuthenticated)
                return;

            if (typeof ParsedContent.data.token !== 'string') {
                // eslint-disable-next-line no-redeclare
                var send = WebSocketV2_MessageTemplate;
                send.code = "authentication_failed";
                send.data = {
                    reason: "no_token"
                };

                return stream.close(4003, JSON.stringify(send, null, 5));
            }

            var { success, tokenData, playerData, reason } = await middleware.authenticateToken_internal(ParsedContent.data.token);

            if (!success) {
                // eslint-disable-next-line no-redeclare
                var send = WebSocketV2_MessageTemplate;
                send.code = "authentication_failed";
                send.data = {
                    reason: reason
                };

                return stream.close(4001, JSON.stringify(send, null, 5));
            }

            // all clear to clean up and proceed
            ClientData.uid = tokenData.id;
            ClientData.nickname = playerData.public.nickname;
            ClientData.isAuthenticated = true;
            ClientData.username = tokenData.username;
            ClientData.isCreativeToolsBetaProgramMember = playerData.private.availableTags.includes("Creative Tools Beta Program Member");
            ClientData.isDeveloper = tokenData.developer;
            ClientData.tags = playerData.private.availableTags;

            // eslint-disable-next-line no-redeclare
            var send = WebSocketV2_MessageTemplate;
            send.code = "authentication_confirmed";
            send.data = {};

            // confirms connection
            stream.send(JSON.stringify(send, null, 5));
        }


    });

    stream.on('message_sent', async (server_id, channel_id, message_id) => {
        if (!ClientData.isAuthenticated)
            return;

        const server_data = await server_collection.findOne({ _id: { $eq: server_id, $exists: true } });
        if (server_data === null)
            return;
        if (!Object.keys(server_data.users).includes(ClientData.uid))
            return;

        const message_content = await message_collection.findOne({ _id: { $eq: message_id, $exists: true } });
        if (message_content === null)
            return;

        const send = {
            code: "message_sent",
            data: {
                server_id: server_id,
                channel_id: channel_id,
                message_id: message_id,
                message_content: message_content
            }
        };

        stream.send(JSON.stringify(send, null, 5));
    });

    stream.on('message_deleted', async (server_id, channel_id, message_id) => {
        if (!ClientData.isAuthenticated)
            return;

        const server_data = await server_collection.findOne({ _id: { $eq: server_id, $exists: true } });
        if (server_data === null)
            return;
        if (!Object.keys(server_data.users).includes(ClientData.uid))
            return;

        const send = {
            code: "message_deleted",
            data: {
                server_id: server_id,
                channel_id: channel_id,
                message_id: message_id
            }
        };

        stream.send(JSON.stringify(send, null, 5));
    });

    stream.on('message_edited', async (server_id, channel_id, message_id) => {
        if (!ClientData.isAuthenticated)
            return;

        const server_data = await server_collection.findOne({ _id: { $eq: server_id, $exists: true } });
        if (server_data === null)
            return;
        if (!Object.keys(server_data.users).includes(ClientData.uid))
            return;

        const message_data = await message_collection.findOne({ _id: { $eq: message_id, $exists: true } });
        if (message_data === null)
            return;

        const send = {
            code: "message_edited",
            data: {
                server_id: server_id,
                channel_id: channel_id,
                message_id: message_id,
                message_content: message_data
            }
        };

        stream.send(JSON.stringify(send, null, 5));
    });
});
