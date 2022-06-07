const helpers = require('../../helpers');
const jwt = require('jsonwebtoken');
const WebSocket = require('ws');
const { ws_connected_clients} = require("../../index");

const WebSocketsLegacy = new WebSocket.Server({ noServer: true });
exports.wss_v1 = WebSocketsLegacy;
WebSocketsLegacy.on('connection', async (ws) => {
    var ignore_connection_closed = false;
    var tokenData;

    console.log("User connected to websocket, awaiting authorization.");

    ws.on('message', async (data) => {
        data = data.toString('utf-8');
        console.log(data);
        if (data.slice(0, 7) === "Bearer " && typeof tokenData === 'undefined') {
            var token = data.slice(7);
            try {
                tokenData = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

                const playerData = await helpers.PullPlayerData(tokenData.id);

                for (let index = 0; index < playerData.auth.bans.length; index++) {
                    const element = playerData.auth.bans[index];

                    if (element.endTS > Date.now()) {
                        //user is banned
                        ws.send("BANNED");
                        ignore_connection_closed = true;
                        ws.terminate();
                        return;
                    }
                }
            } catch (ex) {
                ws.send("UNAUTHORIZED");
                ws.terminate();
                return;
            }

            if (Object.keys(ws_connected_clients).includes(tokenData.id)) {
                ignore_connection_closed = true;
                ws.send("DUPLICATE CONNECTION");
                ws.terminate();
                return;
            }

            ws_connected_clients[tokenData.id] =
               {
                   socket: ws,
                   version: 1,
                   instanceId: null
               };
            console.log(`User ${tokenData.id} has authenticated and is now connected.`);

            var presenceData = await helpers.PullPlayerData(tokenData.id);
            presenceData.presence.status = "online";
            if (presenceData.econ.previous_daily_redeemed < (Date.now() - 86400000)) {
                // Daily login rewards.
                presenceData.econ.currency += 100;
                presenceData.econ.previous_daily_redeemed = Date.now();
            }
            await helpers.PushPlayerData(tokenData.id, presenceData);
            ws.send("AUTHORIZED");

        }
    });

    ws.on('close', async () => {
        if (!ignore_connection_closed && typeof tokenData !== 'undefined') {
            var player_data = await helpers.PullPlayerData(tokenData.id);
            player_data.presence.status = "offline";
            await helpers.PushPlayerData(tokenData.id, player_data);
            delete ws_connected_clients[tokenData.id];
            console.log(`User ${tokenData.id} disconnected.`);
        } else if (typeof tokenData !== 'undefined') {
            // Handle leaving room in session
        }
    });
});
