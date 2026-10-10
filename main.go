package main

import (
	"log"
	"os"

	_ "github.com/joho/godotenv/autoload"

	"github.com/SubsurfaceStudios/CompensationAPI/common"
	"github.com/gin-gonic/gin"
)

func main() {
	// Database setup
	pool, err := common.CreateConnectionPool()
	if err != nil {
		log.Fatalf("[DB] Unable to connect to database: %v\n", err)
	}
	defer pool.Close()

	// Create router
	r := gin.Default()

	r.GET("/", GetHealthStatus(pool))
	r.GET("/health/v1", GetHealthStatus(pool))

	// Begin listening
	log.Fatal(r.Run(os.Getenv("LISTEN_ADDRESS")))
}
