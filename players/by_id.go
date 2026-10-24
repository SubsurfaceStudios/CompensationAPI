package players

import (
	"errors"
	"fmt"
	"net/http"

	"github.com/SubsurfaceStudios/CompensationAPI/database"
	"github.com/SubsurfaceStudios/CompensationAPI/responses"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func GetPlayerById(db database.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// fetch ID param
		maybeId := c.Param("id")

		// parse and validate ID param
		id, err := uuid.Parse(maybeId)
		if err != nil {
			responses.Fail(
				c,
				http.StatusBadRequest,
				"invalid_player_id",
				fmt.Sprintf("You did not provide a valid player UUID. The ID you provided was '%s'", maybeId),
			)
			return
		}

		public, err := db.GetPlayerPublic(c, id)

		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				responses.Fail(
					c,
					http.StatusNotFound,
					"player_not_found",
					fmt.Sprintf("No player exists with the ID %s.", id),
				)
			} else {
				responses.Err(c, "An internal server error occurred while fetching that player's data.")
			}
			return
		}

		// send final result
		responses.OK(c, public)
	}
}
