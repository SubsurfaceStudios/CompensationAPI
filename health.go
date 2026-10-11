package main

import (
	"net/http"
	"runtime"
	"time"

	"github.com/SubsurfaceStudios/CompensationAPI/responses"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

func GetHealthStatus(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		var uptime time.Duration
		var version string

		err := pool.QueryRow(c, "SELECT now() - pg_postmaster_start_time() AS uptime, version() as version;").Scan(&uptime, &version)
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
			"Database": gin.H{
				"Uptime":  uptime.String(),
				"Version": version,
			},
			"API": gin.H{
				"Go":  runtime.Version(),
				"gin": gin.Version,
			},
		})
	}
}
