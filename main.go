package main

import (
	"log"
	"os"

	_ "github.com/joho/godotenv/autoload"

	"github.com/SubsurfaceStudios/CompensationAPI/database"
	"github.com/SubsurfaceStudios/CompensationAPI/players"
	"github.com/gin-gonic/gin"
)

func main() {
	// Database setup
	// FIXME handle database url not set
	pool, err := database.CreateConnectionPool(os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatalf("[DB] Unable to connect to database: %v\n", err)
	}
	defer pool.Close()

	// Create router
	r := gin.Default()

	r.GET("/", GetHealthStatus(pool))
	r.GET("/health/v1", GetHealthStatus(pool))

	r.GET("/players/:id", players.GetPlayerById(pool))
	// r.POST("/players", players.RegisterPlayer(pool))

	// Begin listening
	log.Fatal(r.Run(os.Getenv("LISTEN_ADDRESS")))
}
