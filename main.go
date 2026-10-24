package main

import (
	"context"
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
	db, err := database.ConnectToPostgres(os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatalf("[DB] Unable to connect to database: %v\n", err)
	}
	defer db.Close()

	err = db.RunMigrations(context.Background())
	if err != nil {
		log.Fatal(err)
	}

	// Create router
	r := gin.Default()

	r.GET("/", GetHealthStatus(db))
	r.GET("/health/v1", GetHealthStatus(db))

	r.GET("/players/:id", players.GetPlayerById(db))
	// r.POST("/players", players.RegisterPlayer(pool))

	// Begin listening
	log.Fatal(r.Run(os.Getenv("LISTEN_ADDRESS")))
}
