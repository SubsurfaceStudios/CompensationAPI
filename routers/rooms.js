const router = require('express').Router();
const {authenticateToken, authenticateToken_optional, authenticateDeveloperToken} = require('../middleware');
const firebaseStorage = require('firebase/storage');
const Fuse = require('fuse.js');

// Base URL: /api/rooms/...

// TODO implement API endpoint to create a room.
// eslint-disable-next-line no-unused-vars
const roomTemplate = {
    _id: "undefined_room",
    name: "undefined_room",
    description: "This room is a blank canvas. Make it into whatever you like!",
    creator_id: "16",
    tags: [],
    created_at: new Date(0),
    homeSubroomId: "home",
    subrooms: {},
    userPermissions: {},
    rolePermissions: {
        everyone: {
            viewAndJoin: false,
            createVersions: false,
            setPublicVersion: false
        }
    }
};

router.route("/room/:room_id/info")
    .get(authenticateToken_optional, async (req, res) => {
        try {
            const {room_id} = req.params;

            const {mongoClient} = require('../index');
            const db = mongoClient.db(process.env.MONGOOSE_DATABASE_NAME);

            const room_collection = db.collection("rooms");

            const room = await room_collection.findOne({_id: {$eq: room_id, $exists: true}});
            if(room === null) return res.status(404).send({message: "room_not_found"});

            const userPermissions = room.userPermissions;
            const rolePermissions = room.rolePermissions;

            if(typeof req.user != 'undefined') {
                const role = Object.keys(userPermissions).includes(req.user.id) ? userPermissions[req.user.id] : "everyone";
                const permissions = rolePermissions[role];

                if(!permissions.viewAndJoin && req.user.id !== room.creator_id) return res.status(403).send({message: "invalid_permissions"});
            } else {
                const permissions = rolePermissions.everyone;

                if(!permissions.viewAndJoin) return res.status(403).send({message: "invalid_permissions"});
            }

            // refetch the room using projection so we're not exposing permissions and subroom data to the user
            const room_visible = await room_collection.findOne({_id: {$eq: room_id, $exists: true}}, {projection: {_id: 1, name: 1, description: 1, creator_id: 1, tags: 1, created_at: 1, visits: 1, homeSubroomId: 1}});
            return res.status(200).json(room_visible);
        } catch (ex) {
            res.sendStatus(500);
            throw ex;
        }
    });

router.route("/room/:room_id/subrooms/:subroom_id/download")
    .get(authenticateToken, async (req, res) => {
        try {
            const {room_id, subroom_id} = req.params;

            const {mongoClient: client} = require('../index');
            const db = client.db(process.env.MONGOOSE_DATABASE_NAME);

            const room_collection = db.collection("rooms");

            const room = await room_collection.findOne({_id: {$eq: room_id, $exists: true}});
            if(room === null) return res.status(404).send({message: "room_not_found"});

            // check permissions before checking the subroom, so that you can't figure out subroom names using API spam
            const userPermissions = room.userPermissions;
            const rolePermissions = room.rolePermissions;

            const role = Object.keys(userPermissions).includes(req.user.id) ? userPermissions[req.user.id] : "everyone";
            const permissions = rolePermissions[role];

            if(!permissions.viewAndJoin && req.user.id !== room.creator_id) return res.status(403).send({message: "invalid_permissions"});
               
            if(!Object.keys(room.subrooms).includes(subroom_id)) return res.status(404).send({message: "subroom_not_found"});

            const subroom = room.subrooms[subroom_id];

            const storage = firebaseStorage.getStorage();
            const ref = firebaseStorage.ref(storage, `/rooms/${room_id}/subrooms/${subroom_id}/saves/${subroom.publicVersionId}.json`);

            var arrayBuffer = await firebaseStorage.getBytes(ref);
            var buffer = Buffer.from(arrayBuffer);
               
            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Content-Length': buffer.length
            });
            return res.end(buffer);
        } catch (ex) {
            res.sendStatus(500);
            throw ex;
        }
    });

router.get("/search", authenticateToken_optional, async (req, res) => {
    const {mode, query} = req.query;
    const {mongoClient: client} = require('../index');

    const db = client.db(process.env.MONGOOSE_DATABASE_NAME);
    const rooms_collection = db.collection("rooms");

    var all = await rooms_collection.find({}, {sort: {visits: 1}}).toArray();
    all = all.filter(item => {
        const userPermissions = item.userPermissions;
        const rolePermissions = item.rolePermissions;

        if(typeof req.user != 'undefined') {
            const role = Object.keys(userPermissions).includes(req.user.id) ? userPermissions[req.user.id] : "everyone";
            const permissions = rolePermissions[role];
            return permissions.viewAndJoin;
        } else {
            const permissions = rolePermissions.everyone;
            return permissions.viewAndJoin;
        }
    });


    const results = all.map(item => {
        return {
            _id: item._id,
            name: item.name,
            description: item.description,
            creator_id: item.creator_id,
            tags: item.tags,
            visits: item.visits,
            created_at: item.created_at
        };
    });

    switch(mode) {
    case "search":
        var fuse = new Fuse(results, {
            includeScore: false,
            keys: ["name"],
        });
        var searchResults = fuse.search(query);

        return res.status(200).json(searchResults.map(item => item.item));
    case "originals":
        return res.status(200).json(results.filter(room => room.creator_id === "16"));
    case "most-visited":
        return res.status(200).json(results);
    case "mine":
        return res.status(200).json(results.filter(room => room.creator_id === req.user.id));
    default:
        return res.status(400).json({message: "invalid_mode"});
    }
});

router.put('/:id/versions/new', authenticateDeveloperToken, canViewRoom, async (req, res) => {
    const {id} = req.params;
    // Reserved for future use.
    return res.status(501).json({
        "code": "not_implemented",
        "message": "This endpoint has not yet been implemented."
    });
});
router.post('/:id/versions/:version/associate-data', authenticateDeveloperToken, canViewRoom, async (req, res) => {
    const {id, versions} = req.params;
    // Reserved for future use.
    return res.status(501).json({
        "code": "not_implemented",
        "message": "This endpoint has not yet been implemented."
    });
});
router.patch('/:id/versions/public', authenticateDeveloperToken, canViewRoom, async (req, res) => {
    try {
        const {id} = req.params;
        const {new_id} = req.query;
        if(typeof new_id != 'string') return res.status(400).json({
            "code": "invalid_input",
            "message": "Parameter `new_id` is unset. Please specify a new publicVersionId."
        });

        if(!(await hasPermission(req.user.id, id, "setPublicVersion"))) return res.status(403).json({
            "code": "permission_denied",
            "message": "You do not have permission to perform this action."
        });

        const client = require('../index').mongoClient;
        const room = await client.db(process.env.MONGOOSE_DATABASE_NAME).collection('rooms').findOne({_id: {$eq: id, $exists: true}});
        if(room == null) return res.status(404).json({
            "code": "room_not_found",
            "message": "That room does not exist."
        });
        if(!Object.keys(room.subrooms).includes(new_id)) return res.status(400).json({
            "code": "nonexistent_version",
            "message": "There is no version of this room associated with that ID."
        });

        await client.db(process.env.MONGOOSE_DATABASE_NAME)
            .collection('rooms')
            .updateOne(
                {_id: {$eq: id, $exists: true}},
                {$set: {"publicVersionId": id}}
            );
        
        return res.status(200).json({
            "code": "success",
            "message": "Operation successful"
        });
    } catch (ex) {
        res.status(500).json({
            "code": "internal_error",
            "message": "An internal error occured while processing your request. If the issue persists, please contact CVR staff."
        });
        throw ex;
    }
});


async function canViewRoom(req, res, next) {
    // Input validation
    const client = require('../index').mongoClient;
    const {id} = req.params;
    if(typeof id != 'string') return res.status(404).json({
        "code": "room_not_found",
        "message": "You did not specify a room."
    });

    // Fetch room
    var room = await client
        .db(process.env.MONGOOSE_DATABASE_NAME)
        .collection('rooms')
        .findOne({_id: {$eq: id, $exists: true}});
    if(room == null) return res.status(404).json({
        "code": "room_not_found",
        "message": "You did not specify a room."
    });

    const userPermissions = room.userPermissions;
    const rolePermissions = room.rolePermissions;

    const role = Object.keys(userPermissions).includes(req.user.id) ? userPermissions[req.user.id] : "everyone";
    const canView = rolePermissions[role].viewAndJoin;

    if(!canView) {
        return res.status(404).json({
            "code": "room_not_found",
            "message": "You did not specify a room."
        });
    }

    req.room = room;
    next();
}

async function hasPermission(user_id, room_id, permission) {
    const client = require('../index').mongoClient;
    var room = await client
        .db(process.env.MONGOOSE_DATABASE_NAME)
        .collection('rooms')
        .findOne({_id: {$eq: room_id, $exists: true}});

    const userPermissions = room.userPermissions;
    const rolePermissions = room.rolePermissions;

    const role = Object.keys(userPermissions).includes(user_id) ? userPermissions[user_id] : "everyone";
    return role[permission];
}
async function fetchPermissions(user_id, room_id) {
    const client = require('../index').mongoClient;
    var room = await client
        .db(process.env.MONGOOSE_DATABASE_NAME)
        .collection('rooms')
        .findOne({_id: {$eq: room_id, $exists: true}});

    const userPermissions = room.userPermissions;
    const rolePermissions = room.rolePermissions;

    const role = Object.keys(userPermissions).includes(user_id) ? userPermissions[user_id] : "everyone";
    return role;
}

module.exports = {
    Router: router
};