package main

import (
	"net/http"
	"runtime"

	"github.com/SubsurfaceStudios/CompensationAPI/database"
	"github.com/SubsurfaceStudios/CompensationAPI/responses"
	"github.com/gin-gonic/gin"
)

func GetHealthStatus(db database.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		result, err := db.GetHealthInfo(c)
		if err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"Code":    "database_error",
				"Message": "Degraded: Unable to read simple stats from database.",
				"Success": false,
				"Data": gin.H{
					"API": gin.H{
						"Go":  runtime.Version(),
						"gin": gin.Version,
					},
				},
			})
			return
		}

		responses.OK(c, gin.H{
			"Database": result,
			"API": gin.H{
				"Go":  runtime.Version(),
				"gin": gin.Version,
			},
		})
	}
}
