const router = require('express').Router();
const {authenticateToken, authenticateToken_optional, authenticateTokenAndTag} = require('../middleware');
const Fuse = require('fuse.js');
const express = require('express');
const { getStorage } = require('firebase-admin/storage');
const { v1 } = require('uuid');
const { auditLog, PullPlayerData } = require('../helpers');
const { default: rateLimit } = require('express-rate-limit');

// Base URL: /api/rooms/...

/**
 * @readonly
 * @enum {string}
 */
const AuditEventType = {
    /** Logged when a player first creates a room. */
    RoomCreate: "room_created",
    /** Logged when a player creates a new subroom. */
    SubroomCreate: "subroom_created",
    /** Logged when a user updates another user's role within this room. */
    UserRoleUpdate: "user_roles_updated",
    /** Logged when a user updates the permissions of a role. */
    RolePermissionsUpdate: "role_permissions_updated",
    /** Logged when a user updates the tags for this room. */
    TagUpdate: "tags_updated",
    /** Logged when a user updates the description for this room. */
    DescriptionUpdate: "description_updated",
    /** Logged when a user creates a new changeset. */
    ChangesetCreation: "changeset_created",
    /** Logged when a user changes the public version of this room. */
    PublicVersionUpdate: "public_version_updated",
    /** Logged when a user changes the content flags on this room. */
    ContentFlagsUpdate: "content_flags_updated",
};

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
    },
    cover_image_id: "2"
};

router.use(express.text({
    'limit': '50MB',
    'inflate': true
}));

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
            const room_visible = await room_collection.findOne({_id: {$eq: room_id, $exists: true}}, {projection: {_id: 1, name: 1, description: 1, creator_id: 1, tags: 1, created_at: 1, visits: 1, homeSubroomId: 1, cover_image_id: 1, contentFlags: 1}});
            return res.status(200).json(room_visible);
        } catch (ex) {
            res.sendStatus(500);
            throw ex;
        }
    });

const download_limit = rateLimit({
    'windowMs': 60 * 10 * 1000,
    'max': 10
});

router.route("/room/:room_id/subrooms/:subroom_id/versions/:version_id/download")
    .get(authenticateToken, download_limit, async (req, res) => {
        try {
            var {room_id, subroom_id, version_id} = req.params;

            const {mongoClient: client} = require('../index');
            const db = client.db(process.env.MONGOOSE_DATABASE_NAME);

            const room_collection = db.collection("rooms");

            const room = await room_collection.findOne({_id: {$eq: room_id, $exists: true}});
            if(room == null) return res.status(404).send({message: "room_not_found"});
               
            if(!Object.keys(room.subrooms).includes(subroom_id)) return res.status(404).send({message: "subroom_not_found"});


            
            const subroom = room.subrooms[subroom_id];
            
            if(version_id == 'latest') version_id = subroom.publicVersionId;
            if(!subroom.versions[version_id].associated_file) return res.status(204).json({
                "code": "no_file_associated_with_version",
                "message": "There is no file associated with this version, so loading the room objects is unnecessary."
            });

            const storage = getStorage();
            const file = storage.bucket().file(`rooms/${room_id}/subrooms/${subroom_id}/versions/${version_id}.bin`);
            
            var arrayBuffer = await file.download();
            var buffer = Buffer.from(arrayBuffer[0].buffer);
               
            res.writeHead(200, {
                'Content-Type': 'application/octet-stream',
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
            created_at: item.created_at,
            cover_image_id: item.cover_image_id,
            contentFlags: item.contentFlags
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
        return res.status(400).json({code: "invalid_mode"});
    }
});

router.put('/room/:id/subrooms/:subroom_id/versions/new', authenticateToken, canViewRoom, async (req, res) => {
    try {
        const {id, subroom_id} = req.params;
        const input_metadata = req.body;

        // Validate metadata & assign ID.
        var decoupled_metadata = {
            baseSceneIndex: 9,
            spawn: {
                position: {
                    x: 0,
                    y: 0,
                    z: 0
                },
                rotation: {
                    x: 0,
                    y: 0,
                    z: 0,
                    w: 1
                }
            },
            shortHandCommitMessage: "No Message",
            longHandCommitMessage: "No Description",
            author: "1",
            collaborators: [],
            associated_file: false
        };

        // baseSceneIndex
        if(typeof input_metadata.baseSceneIndex == 'number') decoupled_metadata.baseSceneIndex = input_metadata.baseSceneIndex;
        // Validate spawn location 
        // WARNING: actually good comments coming up
        if(
            !( // NOT
                typeof input_metadata.spawn == 'object' &&                      // Top level object
                typeof input_metadata.spawn?.position == 'object' &&            // Level 2 - Position
                typeof input_metadata.spawn?.rotation == 'object' &&            // Level 2 - Rotation

                typeof input_metadata.spawn?.position?.x == 'number' &&         // Level 3 - X Coordinate
                typeof input_metadata.spawn?.position?.y == 'number' &&         // Level 3 - Y Coordinate
                typeof input_metadata.spawn?.position?.z == 'number' &&         // Level 3 - Z Coordinate

                typeof input_metadata.spawn?.rotation?.x == 'number' &&         // Level 3 - X Quaternion Component
                typeof input_metadata.spawn?.rotation?.y == 'number' &&         // Level 3 - Y Quaternion Component
                typeof input_metadata.spawn?.rotation?.z == 'number' &&         // Level 3 - Z Quaternion Component
                typeof input_metadata.spawn?.rotation?.w == 'number'            // Level 3 - W Quaternion Component
            )
        ) return res.status(400).json({
            "code": "invalid_metadata",
            "message": "The `spawn` parameter of your version metadata is not specified or is invalid."
        });

        // shortHandCommitMessage
        if(typeof input_metadata.shortHandCommitMessage == 'string') decoupled_metadata.shortHandCommitMessage = input_metadata.shortHandCommitMessage;
        
        // longHandCommitMessage
        if(typeof input_metadata.longHandCommitMessage == 'string') decoupled_metadata.longHandCommitMessage = input_metadata.longHandCommitMessage;

        // author
        decoupled_metadata.author = req.user.id;
        // collaborators
        if(!Array.isArray(input_metadata.collaborators)) return res.status(400).json({
            "code": "invalid_metadata",
            "message": "The `collaborators` parameter of your version metadata is not specified or is invalid."
        });

        if(!(await hasPermission(req.user.id, id, 'createVersions'))) return res.status(403).json({
            "code": "permission_denied",
            "message": "You do not have permission to create versions of this room."
        });

        const collection = require('../index').mongoClient.db(process.env.MONGOOSE_DATABASE_NAME).collection('rooms');
        const room = await collection.findOne({_id: {$eq: id, $exists: true}});

        if(!Object.keys(room.subrooms).includes(subroom_id)) return res.status(404).json({
            "code": "nonexistent_subroom",
            "message": "No subroom found with specified ID."
        });

        var updateFilter = {$push: {}};
        updateFilter.$push[`subrooms.${subroom_id}.versions`] = decoupled_metadata;

        await collection.updateOne({ _id: { $eq: id, $exists: true } }, updateFilter);
        
        await roomAuditLog(id, req.user.id, {
            type: AuditEventType.ChangesetCreation
        });

        return res.status(200).json({
            "code": "success",
            "message": "Operation succeeded.",
            "id": room.subrooms[subroom_id].versions.length.toString()
        });
    } catch (ex) {
        res.status(500).json({
            "code": "internal_error",
            "message": "An internal server error occured, and the operation failed. Please contact Support if the issue persists."
        });
        throw ex;
    }
});
router.post('/room/:id/subrooms/:subroom_id/versions/:version_id/associate-data', authenticateToken, canViewRoom, async (req, res) => {
    try {
        var {id, subroom_id, version_id} = req.params;
        const base_64_data = req.body;

        version_id = parseInt(version_id);
        if(isNaN(version_id)) return res.status(400).json({
            "code": "invalid_parameter",
            "message": "Parameter `version` is invalid, must be parsable as Integer."
        });

        if(!(await hasPermission(req.user.id, id, "createVersions"))) return res.status(403).json({
            "code": "permission_denied",
            "message": "You do not have permission to perform the CreateVersion operation."
        });

        const collection = require('../index')
            .mongoClient
            .db(process.env.MONGOOSE_DATABASE_NAME)
            .collection('rooms');

        const room = await collection.findOne({_id: {$eq: id, $exists: true}});
        
        if(!Object.keys(room.subrooms).includes(subroom_id)) return res.status(403).json({
            "code": "nonexistent_subroom",
            "message": "That subroom does not exist."
        });

        const subroom = room.subrooms[subroom_id];
        if(subroom.versions.length - 1 < version_id) return res.status(404).json({
            "code": "version_not_found",
            "message": "No version of this room exists with that ID."
        });

        if(subroom.versions[version_id].associated_file) return res.status(400).json({
            "code": "file_already_associated",
            "message": "There is already a file associated with this version. Try making a new one."
        });

        var buffer;
        try {
            buffer = Buffer.from(base_64_data, 'base64');
        } catch {
            return res.status(400).json({
                "code": "binary_data_invalid",
                "message": "Your byte array could not be parsed into a valid ArrayBuffer."
            });
        }

        const storage = getStorage();
        var file = storage
            .bucket()
            .file(`rooms/${id}/subrooms/${subroom_id}/versions/${version_id}.bin`)
            .createWriteStream({
                'contentType': "application/octet-stream"
            });

        file.end(buffer);

        var updateFilter = {$set: {}};
        updateFilter.$set[`subrooms.${subroom_id}.versions.${version_id}.associated_file`] = true;

        await collection.updateOne({_id: {$eq: id, $exists: true}}, updateFilter);

        return res.status(200).json({
            "code": "success",
            "message": "Operation successful."
        });
    } catch (ex) {
        res.status(500).json({
            "code": "internal_error",
            "message": "An internal server error occured and the operation failed. If the issue persists, contact Support."
        });
        throw ex;
    }
});
router.post('/room/:id/subrooms/:subroom_id/versions/public', authenticateToken, canViewRoom, async (req, res) => {
    try {
        const {id, subroom_id} = req.params;
        const {id: version_id} = req.body;
        if(typeof version_id != 'string') return res.status(400).json({
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
        if(!Object.keys(room.subrooms).includes(subroom_id)) return res.status(404).json({
            "code": "nonexistent_subroom",
            "message": "That subroom does not exist."
        });
        if(room.subrooms[subroom_id].versions.length <= parseInt(version_id)) return res.status(400).json({
            "code": "nonexistent_version",
            "message": "There is no version of this room associated with that ID."
        });

        const str = `subrooms.${subroom_id}.publicVersionId`;

        // this is a painful workaround to fix javascript's assfuckery -Rose
        var setFilter = {};
        setFilter[str] = version_id;


        await client.db(process.env.MONGOOSE_DATABASE_NAME)
            .collection('rooms')
            .updateOne(
                {_id: {$eq: id, $exists: true}},
                {$set: setFilter}
        );
        
        await roomAuditLog(id, req.user.id, {
            type: AuditEventType.PublicVersionUpdate,
            previous_value: room.subrooms[subroom_id].publicVersionId,
            new_value: version_id
        });
        
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

router.post('/room/:id/tags', authenticateToken, requiresRoomPermission("manageTags"), async (req, res) => {
    try {
        const { tags } = req.body;
        const { id } = req.params;

        if (typeof tags != 'object' || !Array.isArray(tags)) return res.status(400).json({
            code: "invalid_input",
            message: "Cannot set tags of room to anything other than a string[]."
        });

        for (let index = 0; index < tags.length; index++) {
            if (typeof tags[index] != 'string') return res.status(400).json({
                code: "invalid_input",
                message: "Cannot set tags of room to anything other than a string[]."
            });
        }

        const db = require('../index').mongoClient.db(process.env.MONGOOSE_DATABASE_NAME);

        await db.collection('rooms')
            .updateOne(
                {
                    _id: {
                        $exists: true,
                        $eq: id
                    }
                },
                {
                    '$set': {
                        "tags": tags
                    }
                }
        );
        
        return res.status(200).json({
            code: "success",
            message: "The operation was successful."
        });
    } catch (ex) {
        res.status(500).json({
            code: "internal_error",
            message: "An internal error occurred and we could not process your request."
        });
        throw ex;
    }
});

router.post('/room/:id/content_flags', authenticateToken, requiresRoomPermission("manageTags"), async (req, res) => {
    try {
        const { flags } = req.body;
        const { id } = req.params;

        if (typeof flags != 'object' || Array.isArray(flags)) return res.status(400).json({
            code: "invalid_input",
            message: "Cannot set flags of room to anything other than a Dictionary<string, string>."
        });

        for (let index = 0; index < Object.keys(flags).length; index++) {
            if (typeof flags[Object.keys(flags)[index]] != 'string') return res.status(400).json({
                code: "invalid_input",
                message: "Cannot set flags of room to anything other than a Dictionary<string, string>."
            });
        }

        const db = require('../index').mongoClient.db(process.env.MONGOOSE_DATABASE_NAME);

        await roomAuditLog(
            id,
            req.user.id,
            {
                type: AuditEventType.ContentFlagsUpdate,
                previous_value:
                    await db.collection('rooms').findOne({
                        _id: { $exists: true, $eq: id }
                    }).contentFlags,
                new_value: flags
            }
        );

        await db.collection('rooms')
            .updateOne(
                {
                    _id: {
                        $exists: true,
                        $eq: id
                    }
                },
                {
                    '$set': {
                        "contentFlags": flags
                    }
                }
        );

        
        
        return res.status(200).json({
            code: "success",
            message: "The operation was successful."
        });
    } catch (ex) {
        res.status(500).json({
            code: "internal_error",
            message: "An internal error occurred and we could not process your request."
        });
        throw ex;
    }
});

router.post('/room/:id/description', authenticateToken, requiresRoomPermission("editDescription"), async (req, res) => {
    try {
        const { description } = req.body;
        const { id } = req.params;

        if (typeof description != 'string') return res.status(400).json({
            code: "invalid_input",
            message: "Cannot set description of room to anything other than a string."
        });

        const db = require('../index').mongoClient.db(process.env.MONGOOSE_DATABASE_NAME);

        await db.collection('rooms')
            .updateOne(
                {
                    _id: {
                        $exists: true,
                        $eq: id
                    }
                },
                {
                    '$set': {
                        "description": description
                    }
                }
        );

        await roomAuditLog(
            id,
            req.user.id,
            {
                type: AuditEventType.DescriptionUpdate,
                previous_value:
                    await db.collection('rooms').findOne({
                        _id: { $exists: true, $eq: id }
                    }).description,
                new_value: description
            }
        );
        
        return res.status(200).json({
            code: "success",
            message: "The operation was successful."
        });
    } catch (ex) {
        res.status(500).json({
            code: "internal_error",
            message: "An internal error occurred and we could not process your request."
        });
        throw ex;
    }
});

router.get('/room/:id/subrooms/list', authenticateToken, requiresRoomPermission("manageSubrooms"), async (req, res) => {
    try {
        const { id } = req.params;

        const db = require('../index').mongoClient.db(process.env.MONGOOSE_DATABASE_NAME);

        const subrooms = (await db.collection('rooms')
            .find(
                {
                    _id: {
                        $eq: id,
                        $exists: true
                    }
                },
                {
                    'projection': {
                        'subrooms': true
                    }
                }
            ).tryNext()).subrooms;
        
        return res.status(200).json({
            code: "success",
            data: subrooms
        });
    } catch (ex) {
        res.status(500).json({
            code: "internal_error",
            message: "An internal server error occurred and we could not serve your request."
        });
        throw ex;
    }
});

router.get('/room/:id/my-permissions', authenticateToken, canViewRoom, async (req, res) => {
    try {
        return res.status(200).json({
            "code": "success",
            "message": "The operation succeeded.",
            "permissions": req.userRoomPermissions
        });
    } catch (ex) {
        res.status(500).json({
            "code": "internal_error",
            "message": "An internal server error occurred, preventing the operation from succeeding."
        });
        throw ex;
    }
});

router.get('/room/:id/subrooms/:subroom_id/versions', authenticateToken, canViewRoom, async (req, res) => {
    try {
        const { subroom_id } = req.params;
        if(!req.userRoomPermissions["createVersions"]) return res.status(403).json({
            "code": "permission_denied",
            "message": "You do not have access to the version registry of this room."
        });
        if(!Object.keys(req.room.subrooms).includes(subroom_id)) return res.status(404).json({
            "code": "nonexistent_subroom",
            "message": "No subroom on record was found with that ID."
        });

        return res.status(200).json({
            "code": "success",
            "message": "Operation successful.",
            "versions": req.room.subrooms[subroom_id].versions.map((item, index) => {
                item.id = `${index}`;
                return item;
            })
        });
    } catch (ex) {
        res.status(500).json({
            "code": "internal_error",
            "message": "An internal server error occurred, preventing the operation from succeeding."
        });
        throw ex;
    }
});

router.post('/new', authenticateTokenAndTag("Creative Tools Beta Program Member"), async (req, res) => {
    try {
        const { name } = req.body;

        const coll = require('../index').mongoClient.db(process.env.MONGOOSE_DATABASE_NAME).collection("rooms");

        
        if(typeof name != 'string') return res.status(400).json({
            code: "unspecified_parameter",
            message: "You did not specify the parameter 'name' in your request body."
        });

        const predecessor = await coll.findOne(
            {
                _id: { $exists: true },
                creator_id: { $exists: true, $eq: req.user.id },
                name: { $exists: true, $eq: name}
            }
        );

        if (predecessor != null) return res.status(400).json({
            code: "room_already_exists",
            message: "You have already created a room with that name."
        });

        let userPermissions = {};
        userPermissions[req.user.id] = "owner";

        const room = {
            _id: v1(),
            name: name,
            description: "An empty room.",
            creator_id: req.user.id,
            tags: ["community", "custom room"],
            created_at: Date.now(),
            visits: 0,
            subrooms: {
                home: {
                    publicVersionId: 0,
                    maxPlayers: 20,
                    versions: [
                        {
                            baseSceneIndex: 15,
                            spawn: {
                                position: {
                                    x: 0,
                                    y: 0,
                                    z: 0,
                                },
                                rotation: {
                                    x: 0,
                                    y: 0,
                                    z: 0,
                                    w: 0
                                }
                            },
                            shortHandCommitMessage: "Initial Commit",
                            longHandCommitMessage: "Initial Commit - Auto-Generated for your convenience by the Compensation VR API.",
                            author: req.user.id,
                            collaborators: [],
                            associated_file: false
                        }
                    ]
                }
            },
            homeSubroomId: "home",
            rolePermissions: {
                everyone: {
                    viewAndJoin: false,
                    createVersions: false,
                    setPublicVersion: false,
                    viewSettings: false,
                    viewPermissions: false,
                    managePermissions: false,
                    useCreationTool: false
                },
                owner: {
                    viewAndJoin: true,
                    createVersions: true,
                    setPublicVersion: true,
                    viewSettings: true,
                    viewPermissions: true,
                    managePermissions: true,
                    useCreationTool: true
                }
            },
            userPermissions: userPermissions,
            cover_image_id: "2",
            contentFlags: {}
        };

        await coll.insertOne(room);
        await roomAuditLog(
            room._id,
            req.user.id,
            {
                type: AuditEventType.RoomCreate,
                new_value: name
            }
        );

        auditLog(`User ${req.user.id} created new room with ID ${room._id} and name ${name}.`);
        
        return res.status(200).json({
            code: "success",
            message: "The operation was successful."
        });
    } catch (ex) {
        res.status(500).json({
            code: "internal_server_error",
            message: "An internal server error occurred and we were unable to process your request."
        });
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
    const canView = rolePermissions[role].viewAndJoin || req.user.developer;

    if(!canView) {
        return res.status(404).json({
            "code": "room_not_found",
            "message": "You did not specify a room."
        });
    }

    req.room = room;
    req.userRoomRole = room.userPermissions;
    req.userRoomPermissions = rolePermissions[role];
    next();
}

function requiresRoomPermission(permission) {
    return async (req, res, next) => {
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
            "message": "Room not found."
        });
    
        const userPermissions = room.userPermissions;
        const rolePermissions = room.rolePermissions;
    
        const role = Object.keys(userPermissions).includes(req.user.id) ? userPermissions[req.user.id] : "everyone";
    
        if(!req.user.developer && rolePermissions[role][permission]) {
            return res.status(404).json({
                "code": "room_not_found",
                "message": "Access denied."
            });
        }
    
        req.room = room;
        req.userRoomRole = room.userPermissions;
        req.userRoomPermissions = rolePermissions[role];
        next();
    };
}

async function hasPermission(user_id, room_id, permission) {
    const client = require('../index').mongoClient;
    var room = await client
        .db(process.env.MONGOOSE_DATABASE_NAME)
        .collection('rooms')
        .findOne({ _id: { $eq: room_id, $exists: true } });
    
    const user = await PullPlayerData(user_id);
    if (user.private.availableTags.includes("Developer")) return true;

    const userPermissions = room.userPermissions;
    const rolePermissions = room.rolePermissions;

    const assigned_role = Object.keys(userPermissions).includes(user_id) ? userPermissions[user_id] : "everyone";
    const role = rolePermissions[assigned_role];
    return role[permission];
}

/**
 * @async
 * @function roomAuditLog
 * @param {string} room_id - The room ID to apply the event to.
 * @param {string} user_id - The user applying this event.
 * @param {Object} event - The audit log event to apply.
 * @param {AuditEventType} event.type - The type of event this is.
 * @param {string?} event.previous_value - The previous value of the variable changed, if applicable.
 * @param {string?} event.new_value - The new value of the variable changed, if applicable.
 * @returns {Promise<void>}
 */
async function roomAuditLog(room_id, user_id, event) {
    const client = require('../index').mongoClient;
    const db = client.db(process.env.MONGOOSE_DATABASE_NAME);
    const collection = db.collection("room_audit");
    
    var event = {
        room_id: room_id,
        user_id: user_id,
        event_time: Date.now(),
        event_data: event
    };

    await collection.insertOne(event);
}

module.exports = {
    Router: router,
    roomAuditLog: roomAuditLog
};