package players

import (
	"github.com/SubsurfaceStudios/CompensationAPI/responses"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

func GetPlayerById(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		responses.Unimplemented(c)
		// // fetch ID param
		// maybeId := c.Param("id")

		// // parse and validate ID param
		// id, err := uuid.Parse(maybeId)
		// if err != nil {
		// 	responses.Fail(
		// 		c,
		// 		http.StatusBadRequest,
		// 		"invalid_player_id",
		// 		fmt.Sprintf("You did not provide a valid player UUID. The ID you provided was '%s'", maybeId),
		// 	)
		// 	return
		// }

		// // query for base Player object
		// playerRow := pool.QueryRow(
		// 	c,
		// 	"SELECT "+
		// 		"p.id, p.username, p.created, p.nickname, p.pronouns, p.tag, p.bio, "+
		// 		"(instance.id IS NOT NULL) AS is_online, COALESCE(instance.is_public, false) AS in_public_instance, "+
		// 		"room.id, room.name, room.created, room.description, room.visits, "+
		// 		"room_owner.id, room_owner.username, room_owner.nickname, room_owner.pronouns "+
		// 		"FROM player AS p "+
		// 		"LEFT JOIN room_instance AS instance ON p.room_instance_id = instance.id "+
		// 		"LEFT JOIN room ON instance.room_id = room.id "+
		// 		"LEFT JOIN player AS room_owner ON room_owner.id = room.owner_id "+
		// 		"WHERE p.id = $1;",
		// 	id,
		// )

		// var username string
		// var created time.Time
		// var nickname string
		// var pronouns string
		// var tag string
		// var bio string

		// var status status

		// // read from query
		// err = playerRow.Scan(
		// 	&id, &username, &created, &nickname, &pronouns, &tag, &bio,
		// 	&status.IsOnline, &status.InPublicInstance,
		// 	&status.Room.ID, &status.Room.Name, &status.Room.Created, &status.Room.Description, &status.Room.Visits,
		// 	&status.Room.Owner.ID, &status.Room.Owner.Username, &status.Room.Owner.Nickname, &status.Room.Owner.Pronouns,
		// )
		// // TODO 404
		// if err != nil {
		// 	responses.Fail(c, http.StatusInternalServerError, "internal_server_error", "Unable to fetch player data from database.")
		// 	// TODO structured logging
		// 	println(err.Error())
		// 	return
		// }

		// // query equipped items
		// outfitRows, err := pool.Query(c, "SELECT item.id AS id, item.name AS name, item.prefab AS prefab, equipped_item.slot AS slot FROM equipped_item JOIN item ON item.id = equipped_item.item_id WHERE equipped_item.player_id = $1;", id)
		// if err != nil {
		// 	responses.Fail(
		// 		c,
		// 		http.StatusInternalServerError,
		// 		"internal_server_error",
		// 		"Unable to fetch player outfit from database.",
		// 	)
		// 	println(err.Error())
		// 	return
		// }
		// defer outfitRows.Close()

		// // read outfit from query results
		// outfit := make(map[string]equippedItem)
		// for outfitRows.Next() {
		// 	var item equippedItem

		// 	err = outfitRows.Scan(&item.ID, &item.Name, &item.Prefab, &item.Slot)
		// 	if err != nil {
		// 		println(err.Error())
		// 		// FIXME
		// 		continue
		// 	}

		// 	outfit[item.Slot] = item
		// }
		// outfitRows.Close()

		// // send final result
		// responses.OK(c, gin.H{
		// 	"ID":       id,
		// 	"Username": username,
		// 	"Created":  created,
		// 	"Nickname": nickname,
		// 	"Pronouns": pronouns,
		// 	"Tag":      tag,
		// 	"Bio":      bio,
		// 	"Outfit":   outfit,
		// 	"Status":   status,
		// })
	}
}
