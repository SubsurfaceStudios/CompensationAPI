async function temporarilyBlocked(req, res, next) {
     return res.status(503).send({message: "temporarily_blocked_by_developer"});
}

module.exports = temporarilyBlocked;