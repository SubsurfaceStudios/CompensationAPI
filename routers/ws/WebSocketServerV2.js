const helpers = require('../../helpers');
const MatchmakingAPI = require('../matchmaking');
const middleware = require('../../middleware');
const WebSocket = require('ws');
const { MatchmakingModes } = require('../matchmaking');
const { WebSocketV2_MessageTemplate } = require("../../index");
var ws_connected_clients = {};
exports.ws_connected_clients = ws_connected_clients;

const WebSocketServerV2 = new WebSocket.Server({ noServer: true });
exports.WebSocketServerV2 = WebSocketServerV2;
WebSocketServerV2.on('connection', (Socket) => {
    var ConnectedUserData = {
        uid: null,
        username: "",
        nickname: "",
        isAuthenticated: false,
        tags: [],
        isDeveloper: false,
        isCreativeToolsBetaProgramMember: false,
        matchmaking_InstanceId: null,
        matchmaking_RoomId: null,
        matchmaking_GlobalInstanceId: null
    };

    Socket.on('ping', async () => {
        Socket.pong();
    });

    Socket.on('message', async (data) => {
        try {
            var ParsedContent = JSON.parse(data.toString('utf-8'));
        } catch (ex) {
            var send = WebSocketV2_MessageTemplate;
            send.code = "throw_exception";
            send.data = {
                text: "json_parse_failed"
            };

            Socket.send(send);
            throw ex;
        }

        if (typeof ParsedContent.code != 'string' || typeof ParsedContent.data != 'object')
            return;

        // begin parsing data
        switch (ParsedContent.code) {
        case "authenticate":
            if (ConnectedUserData.isAuthenticated)
                return;

            if (typeof ParsedContent.data.token != 'string') {

                // eslint-disable-next-line no-redeclare
                var send = WebSocketV2_MessageTemplate;
                send.code = "authentication_failed";
                send.data = {
                    reason: "no_token"
                };

                return Socket.close(4003, JSON.stringify(send, null, 5));
            }

            var { success, tokenData, playerData, reason } = await middleware.authenticateToken_internal(ParsedContent.data.token);


            if (!success) {
                // eslint-disable-next-line no-redeclare
                var send = WebSocketV2_MessageTemplate;
                send.code = "authentication_failed";
                send.data = {
                    reason: reason
                };

                return Socket.close(4001, JSON.stringify(send, null, 5));
            }

            if (Object.keys(ws_connected_clients).includes(tokenData.id)) {
                // eslint-disable-next-line no-redeclare
                var send = WebSocketV2_MessageTemplate;
                send.code = "authentication_failed";
                send.data = {
                    reason: "duplicate_connection"
                };

                return Socket.close(4002, JSON.stringify(send, null, 5));
            }

            // all clear to clean up and proceed
            ConnectedUserData.uid = tokenData.id;
            ConnectedUserData.nickname = playerData.public.nickname;
            ConnectedUserData.isAuthenticated = true;
            ConnectedUserData.username = tokenData.username;
            ConnectedUserData.isCreativeToolsBetaProgramMember = playerData.private.availableTags.includes("Creative Tools Beta Program Member");
            ConnectedUserData.isDeveloper = tokenData.developer;
            ConnectedUserData.tags = playerData.private.availableTags;

            var final_send = WebSocketV2_MessageTemplate;
            final_send.code = "authentication_success";
            final_send.data = {
                message: tokenData.id !== "2" ? `Welcome back to Compensation VR.\nYou have ${playerData.notifications.length} unread notifications.` : `welcome back dumbfuck\nread your notifications you've got 9999.`
            };

            ws_connected_clients[ConnectedUserData.uid] = {
                socket: Socket,
                version: 2,
                instanceId: null,
                roomId: null,
                subroomId: null,
                globalInstanceId: null,
                joinCode: null
            };

            console.log(`User "${ConnectedUserData.nickname}" / @${ConnectedUserData.username} with ID ${ConnectedUserData.uid} has connected.`);
            return Socket.send(JSON.stringify(final_send, null, 5));
        case "join_or_create_matchmaking_instance":
            if (!ConnectedUserData.isAuthenticated)
                return;
            if (typeof ParsedContent.data.roomId != 'string' || typeof ParsedContent.data.subroomId != 'string')
                return;

            var db = require('../../index').mongoClient.db(process.env.MONGOOSE_DATABASE_NAME);
            var collection = db.collection("rooms");

            var room = await collection.findOne({ _id: { $eq: ParsedContent.data.roomId, $exists: true } });
            if (room === null)
                return;
            if (!Object.keys(room.subrooms).includes(ParsedContent.data.subroomId))
                return;


            // leave current room
            if (ConnectedUserData.matchmaking_InstanceId !== null) {
                try {
                    var instance = await MatchmakingAPI.GetInstanceById(ConnectedUserData.matchmaking_RoomId, ConnectedUserData.matchmaking_InstanceId);
                    instance.RemovePlayer(ConnectedUserData.uid);
                    await MatchmakingAPI.SetInstance(ConnectedUserData.matchmaking_RoomId, ConnectedUserData.matchmaking_InstanceId, instance);
                    ConnectedUserData.matchmaking_InstanceId = null;
                    ConnectedUserData.matchmaking_RoomId = null;
                } catch (err) {
                    console.error(err);
                }
            }

            var instances = await MatchmakingAPI.GetInstances(ParsedContent.data.roomId);
            var filtered = instances.filter(instance => instance.Players < instance.MaxPlayers && instance.SubroomId === ParsedContent.data.subroomId && instance.MatchmakingMode === MatchmakingModes.Public);


            // short circuit for if no instances are available to create a new one
            if (filtered.length < 1) {
                var subroom = room.subrooms[ParsedContent.data.subroomId];
                // eslint-disable-next-line no-redeclare
                var instance = await MatchmakingAPI.CreateInstance(ParsedContent.data.roomId, ParsedContent.data.subroomId, MatchmakingModes.Public, 300 * 1000, false, subroom.maxPlayers, null);
                instance.AddPlayer(ConnectedUserData.uid);
                MatchmakingAPI.SetInstance(ParsedContent.data.roomId, instance.InstanceId, instance);

                // eslint-disable-next-line no-redeclare
                var send = WebSocketV2_MessageTemplate;
                send.code = "join_or_create_photon_room";
                send.data = {
                    name: instance.JoinCode,
                    baseSceneId: subroom.versions[subroom.publicVersionId].baseSceneIndex,
                    spawn: subroom.versions[subroom.publicVersionId].spawn
                };

                Socket.send(JSON.stringify(send, null, 5));

                ConnectedUserData.matchmaking_InstanceId = instance.InstanceId;
                ConnectedUserData.matchmaking_GlobalInstanceId = instance.GlobalInstanceId;
                ConnectedUserData.matchmaking_RoomId = instance.RoomId;

                ws_connected_clients[ConnectedUserData.uid].instanceId = instance.InstanceId;
                ws_connected_clients[ConnectedUserData.uid].roomId = instance.roomid;
                ws_connected_clients[ConnectedUserData.uid].subroomId = instance.subroomId;
                ws_connected_clients[ConnectedUserData.uid].globalInstanceId = instance.GlobalInstanceId;
                ws_connected_clients[ConnectedUserData.uid].joinCode = instance.JoinCode;
                return;
            }

            var final_selection;

            var shortCircuit = false;
            // short-circuit for rooms in the same global instance
            for (let i = 0; i < filtered.length; i++) {
                const element = filtered[i];
                if (element.GlobalInstanceId !== ConnectedUserData.matchmaking_GlobalInstanceId)
                    continue;

                // element has the same global instance id as the user, so we can short circuit this whole process to make sure they stay with their current nearby players.
                shortCircuit = true;
                final_selection = element;

                // we can handle the rest of the join logic normally
                console.log("short-circuit for same global instance");
            }

            // non-full, joinable & public instances exist, choose one
            // this method will strive for the largest possible instance, within the bounds of the room's max players
            // can change later but rn idgaf
            if (!shortCircuit) {
                final_selection = filtered.sort((a, b) => a.Players - b.Players)[0];
            }

            final_selection.AddPlayer(ConnectedUserData.uid);
            await MatchmakingAPI.SetInstance(ParsedContent.data.roomId, final_selection.InstanceId, final_selection);

            // eslint-disable-next-line no-redeclare
            var send = WebSocketV2_MessageTemplate;
            send.code = "join_or_create_photon_room";

            // eslint-disable-next-line no-redeclare
            var subroom = room.subrooms[ParsedContent.data.subroomId];
            send.data = {
                name: final_selection.JoinCode,
                baseSceneId: subroom.versions[subroom.publicVersionId].baseSceneIndex,
                spawn: subroom.versions[subroom.publicVersionId].spawn
            };

            Socket.send(JSON.stringify(send, null, 5));

            ConnectedUserData.matchmaking_InstanceId = final_selection.InstanceId;
            ConnectedUserData.matchmaking_RoomId = final_selection.RoomId;
            ConnectedUserData.matchmaking_GlobalInstanceId = final_selection.GlobalInstanceId;

            ws_connected_clients[ConnectedUserData.uid].instanceId = final_selection.InstanceId;
            ws_connected_clients[ConnectedUserData.uid].roomId = final_selection.RoomId;
            ws_connected_clients[ConnectedUserData.uid].subroomId = final_selection.SubroomId;
            ws_connected_clients[ConnectedUserData.uid].globalInstanceId = final_selection.GlobalInstanceId;
            ws_connected_clients[ConnectedUserData.uid].joinCode = final_selection.JoinCode;
            return;
        case "create_public_matchmaking_instance":
            if (!ConnectedUserData.isAuthenticated)
                return;
            if (typeof ParsedContent.data.roomId != 'string' || typeof ParsedContent.data.subroomId != 'string')
                return;

            // eslint-disable-next-line no-redeclare
            var db = require('../../index').mongoClient.db(process.env.MONGOOSE_DATABASE_NAME);
            // eslint-disable-next-line no-redeclare
            var collection = db.collection("rooms");

            // eslint-disable-next-line no-redeclare
            var room = await collection.findOne({ _id: { $eq: ParsedContent.data.roomId, $exists: true } });
            if (room === null)
                return;
            if (!Object.keys(room.subrooms).includes(ParsedContent.data.subroomId))
                return;

            // eslint-disable-next-line no-redeclare
            var instances = await MatchmakingAPI.GetInstances(ParsedContent.data.roomId);


            // leave current room
            if (ConnectedUserData.matchmaking_InstanceId !== null) {
                try {
                    var inst = await MatchmakingAPI.GetInstanceById(ConnectedUserData.matchmaking_RoomId, ConnectedUserData.matchmaking_InstanceId);
                    inst.RemovePlayer(ConnectedUserData.uid);
                    await MatchmakingAPI.SetInstance(ConnectedUserData.matchmaking_RoomId, ConnectedUserData.matchmaking_InstanceId, inst);
                    ConnectedUserData.matchmaking_InstanceId = null;
                    ConnectedUserData.matchmaking_RoomId = null;
                } catch (err) {
                    console.error(err);
                }
            }

            // eslint-disable-next-line no-redeclare
            var subroom = room.subrooms[ParsedContent.data.subroomId];
            // eslint-disable-next-line no-redeclare
            var instance = await MatchmakingAPI.CreateInstance(ParsedContent.data.roomId, ParsedContent.data.subroomId, MatchmakingModes.Public, 300 * 1000, false, subroom.maxPlayers);
            instance.AddPlayer(ConnectedUserData.uid);
            MatchmakingAPI.SetInstance(ParsedContent.data.roomId, instance.InstanceId, instance);

            // eslint-disable-next-line no-redeclare
            var send = WebSocketV2_MessageTemplate;
            send.code = "join_or_create_photon_room";
            send.data = {
                name: instance.JoinCode,
                baseSceneId: subroom.versions[subroom.publicVersionId].baseSceneIndex,
                spawn: subroom.versions[subroom.publicVersionId].spawn
            };

            Socket.send(JSON.stringify(send, null, 5));

            ConnectedUserData.matchmaking_InstanceId = instance.InstanceId;
            ConnectedUserData.matchmaking_RoomId = ParsedContent.data.roomId;
            ConnectedUserData.matchmaking_GlobalInstanceId = instance.GlobalInstanceId;

            ws_connected_clients[ConnectedUserData.uid].instanceId = instance.InstanceId;
            ws_connected_clients[ConnectedUserData.uid].roomId = instance.roomid;
            ws_connected_clients[ConnectedUserData.uid].subroomId = instance.subroomId;
            ws_connected_clients[ConnectedUserData.uid].globalInstanceId = instance.GlobalInstanceId;
            ws_connected_clients[ConnectedUserData.uid].joinCode = instance.JoinCode;
            return;
        case "create_private_matchmaking_instance":
            if (!ConnectedUserData.isAuthenticated)
                return;
            if (typeof ParsedContent.data.roomId != 'string' || typeof ParsedContent.data.subroomId != 'string')
                return;

            // eslint-disable-next-line no-redeclare
            var db = require('../../index').mongoClient.db(process.env.MONGOOSE_DATABASE_NAME);
            // eslint-disable-next-line no-redeclare
            var collection = db.collection("rooms");

            // eslint-disable-next-line no-redeclare
            var room = await collection.findOne({ _id: { $eq: ParsedContent.data.roomId, $exists: true } });
            if (room === null)
                return;
            if (!Object.keys(room.subrooms).includes(ParsedContent.data.subroomId))
                return;

            // eslint-disable-next-line no-redeclare
            var instances = await MatchmakingAPI.GetInstances(ParsedContent.data.roomId);


            // leave current room
            if (ConnectedUserData.matchmaking_InstanceId !== null) {
                try {
                    // eslint-disable-next-line no-redeclare
                    var inst = await MatchmakingAPI.GetInstanceById(ConnectedUserData.matchmaking_RoomId, ConnectedUserData.matchmaking_InstanceId);
                    inst.RemovePlayer(ConnectedUserData.uid);
                    await MatchmakingAPI.SetInstance(ConnectedUserData.matchmaking_RoomId, ConnectedUserData.matchmaking_InstanceId, inst);
                    ConnectedUserData.matchmaking_InstanceId = null;
                    ConnectedUserData.matchmaking_RoomId = null;
                } catch (err) {
                    console.error(err);
                }
            }

            // eslint-disable-next-line no-redeclare
            var subroom = room.subrooms[ParsedContent.data.subroomId];
            // eslint-disable-next-line no-redeclare
            var instance = await MatchmakingAPI.CreateInstance(ParsedContent.data.roomId, ParsedContent.data.subroomId, MatchmakingModes.Private, 300 * 1000, false, subroom.maxPlayers);
            instance.AddPlayer(ConnectedUserData.uid);
            MatchmakingAPI.SetInstance(ParsedContent.data.roomId, instance.InstanceId, instance);

            // eslint-disable-next-line no-redeclare
            var send = WebSocketV2_MessageTemplate;
            send.code = "join_or_create_photon_room";
            send.data = {
                name: instance.JoinCode,
                baseSceneId: subroom.versions[subroom.publicVersionId].baseSceneIndex,
                spawn: subroom.versions[subroom.publicVersionId].spawn
            };

            Socket.send(JSON.stringify(send, null, 5));

            ConnectedUserData.matchmaking_InstanceId = instance.InstanceId;
            ConnectedUserData.matchmaking_RoomId = ParsedContent.data.roomId;
            ConnectedUserData.matchmaking_GlobalInstanceId = instance.GlobalInstanceId;

            ws_connected_clients[ConnectedUserData.uid].instanceId = instance.InstanceId;
            ws_connected_clients[ConnectedUserData.uid].roomId = instance.roomid;
            ws_connected_clients[ConnectedUserData.uid].subroomId = instance.subroomId;
            ws_connected_clients[ConnectedUserData.uid].globalInstanceId = instance.GlobalInstanceId;
            ws_connected_clients[ConnectedUserData.uid].joinCode = instance.JoinCode;
            return;
        case "matchmaking_reconnection_verify":
            if (!ConnectedUserData.isAuthenticated)
                return;
            if (typeof ParsedContent.data.room_id != 'string' || typeof ParsedContent.data.join_code != 'string')
                return;

            // eslint-disable-next-line no-redeclare
            var instance = await MatchmakingAPI.GetInstanceByJoinCode(ParsedContent.data.room_id, ParsedContent.data.join_code);
            instance.AddPlayer(ConnectedUserData.uid);

            await MatchmakingAPI.SetInstance(ParsedContent.data.room_id, instance.InstanceId, instance);

            ConnectedUserData.matchmaking_InstanceId = instance.InstanceId;
            ConnectedUserData.matchmaking_RoomId = instance.RoomId;
            ConnectedUserData.matchmaking_GlobalInstanceId = instance.GlobalInstanceId;

            ws_connected_clients[ConnectedUserData.uid].instanceId = instance.InstanceId;
            ws_connected_clients[ConnectedUserData.uid].roomId = instance.roomid;
            ws_connected_clients[ConnectedUserData.uid].subroomId = instance.subroomId;
            ws_connected_clients[ConnectedUserData.uid].globalInstanceId = instance.GlobalInstanceId;
            ws_connected_clients[ConnectedUserData.uid].joinCode = instance.JoinCode;
            return;
        case "join_player_invite":
            if (!ConnectedUserData.isAuthenticated)
                return;
            if (typeof ParsedContent.data.user_id != 'string')
                return;

            var currentData = await helpers.PullPlayerData(ConnectedUserData.uid);
            var inviteIndex = currentData.notifications.findIndex(x => x.template === "invite" && x.parameters.sending_id === ParsedContent.data.user_id);

            if (inviteIndex === -1)
                return;

            var invite = currentData.notifications[inviteIndex];
            if (invite.expiresAt < Date.now()) {
                currentData.notifications.splice(inviteIndex);
                await helpers.PushPlayerData(ConnectedUserData.uid, currentData);
                return;
            }

            // The invite itself is valid, now validate the player's location.
            if (typeof ws_connected_clients[ParsedContent.data.user_id] != 'object') {
                // If the player is offline, revoke the invite & fail.
                currentData.notifications.splice(inviteIndex);
                await helpers.PushPlayerData(ConnectedUserData.uid, currentData);
                return;
            }

            if (typeof ws_connected_clients[ParsedContent.data.user_id].joinCode != 'string') {
                // If the player is online, but doesn't have a join code, revoke the invite & fail.
                currentData.notifications.splice(inviteIndex);
                await helpers.PushPlayerData(ConnectedUserData.uid, currentData);
                return;
            }

            if (ws_connected_clients[ParsedContent.data.user_id].joinCode === ws_connected_clients[ConnectedUserData.uid].joinCode) {
                // The player is already in the same room, fail.
                currentData.notifications.splice(inviteIndex);
                await helpers.PushPlayerData(ConnectedUserData.uid, currentData);
                return;
            }

            // The invite & player sending it are valid, process the request.
            // eslint-disable-next-line no-redeclare
            var instance = await MatchmakingAPI.GetInstanceByJoinCode(ws_connected_clients[ParsedContent.data.user_id].roomId, ws_connected_clients[ParsedContent.data.user_id].joinCode);

            if (typeof instance != 'object') {
                // Instance is invalid for some reason, fail.
                currentData.notifications.splice(inviteIndex);
                await helpers.PushPlayerData(ConnectedUserData.uid, currentData);
                return;
            }

            if (instance.Players.length >= instance.MaxPlayers) {
                // Instance is full, fail.
                currentData.notifications.splice(inviteIndex);
                await helpers.PushPlayerData(ConnectedUserData.uid, currentData);
                return;
            }

            instance.AddPlayer(ConnectedUserData.uid);

            await MatchmakingAPI.SetInstance(instance.RoomId, instance.InstanceId, instance);

            ConnectedUserData.matchmaking_InstanceId = instance.InstanceId;
            ConnectedUserData.matchmaking_RoomId = instance.RoomId;
            ConnectedUserData.matchmaking_GlobalInstanceId = instance.GlobalInstanceId;

            ws_connected_clients[ConnectedUserData.uid].instanceId = instance.InstanceId;
            ws_connected_clients[ConnectedUserData.uid].roomId = instance.roomid;
            ws_connected_clients[ConnectedUserData.uid].subroomId = instance.subroomId;
            ws_connected_clients[ConnectedUserData.uid].globalInstanceId = instance.GlobalInstanceId;
            ws_connected_clients[ConnectedUserData.uid].joinCode = instance.JoinCode;

            // eslint-disable-next-line no-redeclare
            var room = await collection.findOne({ _id: { $eq: ConnectedUserData.matchmaking_RoomId, $exists: true } });

            // eslint-disable-next-line no-redeclare
            var send = WebSocketV2_MessageTemplate;
            send.type = "join_or_create_photon_room";
            send.data = {
                name: instance.JoinCode,
                baseSceneId: room.subrooms[instance.subroomId].versions[room.subrooms[instance.subroomId].publicVersionId].baseSceneId,
                spawn: room.subrooms[instance.subroomId].versions[room.subrooms[instance.subroomId].publicVersionId].spawn,
            };

            Socket.send(JSON.stringify(send, null, 5));
            return;
        case "decline_player_invite":
            if (!ConnectedUserData.isAuthenticated)
                return;
            if (typeof ParsedContent.data.user_id != 'string')
                return;

            // eslint-disable-next-line no-redeclare
            var currentData = await helpers.PullPlayerData(ConnectedUserData.uid);
            // eslint-disable-next-line no-redeclare
            var inviteIndex = currentData.notifications.findIndex(x => x.type === "invite" && x.parameters.sending_id === ParsedContent.data.user_id);

            if (inviteIndex === -1)
                return;

            currentData.notifications.splice(inviteIndex);
            await helpers.PushPlayerData(ConnectedUserData.uid, currentData);

            // eslint-disable-next-line no-redeclare
            var otherData = await helpers.PullPlayerData(currentData.notifications[inviteIndex].parameters.sending_id);

            var notif = {
                template: "invite_declined",
                parameters: {
                    sendingPlayer: ConnectedUserData.uid,
                    sending_data: currentData.public,
                    headerText: "Invite Declined",
                    bodyText: `@${currentData.public.username} has declined your invite.`,
                    cancelText: "OK",
                    continueText: "OK"
                }
            };

            otherData.notifications.push(notif);
            await helpers.PushPlayerData(currentData.notifications[inviteIndex].parameters.sending_id, otherData);
            return;
        }
    });
    Socket.on('force-pull', async (roomId, instanceId) => {
        if (!ConnectedUserData.isAuthenticated)
            return;
        var instance = await MatchmakingAPI.GetInstanceById(roomId, instanceId);
        var roomData = await require('../../index')
            .mongoClient
            .db(process.env.MONGOOSE_DATABASE_NAME)
            .collection('rooms')
            .findOne({ _id: { $eq: roomId, $exists: true } });
        instance.AddPlayer(ConnectedUserData.uid);
        await MatchmakingAPI.SetInstance(instance.RoomId, instance.InstanceId, instance);

        ConnectedUserData.matchmaking_InstanceId = instance.InstanceId;
        ConnectedUserData.matchmaking_RoomId = instance.RoomId;
        ConnectedUserData.matchmaking_GlobalInstanceId = instance.GlobalInstanceId;

        ws_connected_clients[ConnectedUserData.uid].instanceId = instance.InstanceId;
        ws_connected_clients[ConnectedUserData.uid].roomId = instance.roomid;
        ws_connected_clients[ConnectedUserData.uid].subroomId = instance.subroomId;
        ws_connected_clients[ConnectedUserData.uid].globalInstanceId = instance.GlobalInstanceId;
        ws_connected_clients[ConnectedUserData.uid].joinCode = instance.JoinCode;

        // eslint-disable-next-line no-redeclare
        var send = WebSocketV2_MessageTemplate;
        send.code = "join_or_create_photon_room";
        send.data = {
            name: instance.JoinCode,
            // we will never speak of this again
            baseSceneId: roomData.subrooms[instance.subroomId].versions[roomData.subrooms[instance.subroomId].publicVersionId].baseSceneId,
            // or this
            spawn: roomData.subrooms[instance.subroomId].versions[roomData.subrooms[instance.subroomId].publicVersionId].spawn,
            issued: Date.now()
        };
        Socket.send(JSON.stringify(send));
    });
    Socket.on('close', async (code, reason) => {
        console.log(`Socket closed with code ${code} and reason ${reason}`);
        if (!ConnectedUserData.isAuthenticated)
            return;
        if (!Object.keys(ws_connected_clients).includes(ConnectedUserData.uid))
            return;

        if (ws_connected_clients[ConnectedUserData.uid].version !== 2)
            return;

        delete ws_connected_clients[ConnectedUserData.uid];
        console.log(`User "${ConnectedUserData.nickname}" / @${ConnectedUserData.username} with ID ${ConnectedUserData.uid} has disconnected.`);

        if (ConnectedUserData.matchmaking_InstanceId !== null) {
            var instance = await MatchmakingAPI.GetInstanceById(ConnectedUserData.matchmaking_RoomId, ConnectedUserData.matchmaking_InstanceId);
            if (instance !== null) {
                instance.RemovePlayer(ConnectedUserData.uid);
                await MatchmakingAPI.SetInstance(ConnectedUserData.matchmaking_RoomId, ConnectedUserData.matchmaking_InstanceId, instance);
            }
        }
    });
    Socket.on('error', (err) => {
        throw err;
    });
});
