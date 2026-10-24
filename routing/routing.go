package routing

import (
	"github.com/SubsurfaceStudios/CompensationAPI/database"
	"github.com/SubsurfaceStudios/CompensationAPI/health"
	"github.com/SubsurfaceStudios/CompensationAPI/players"
	"github.com/gin-gonic/gin"
)

func SetupRouter(db database.DB) *gin.Engine {
	r := gin.Default()

	r.GET("/", health.GetHealthStatus(db))
	r.GET("/health/v1", health.GetHealthStatus(db))

	r.GET("/players/:id", players.GetPlayerById(db))
	r.POST("/players", players.RegisterPlayer(db))

	return r
}
