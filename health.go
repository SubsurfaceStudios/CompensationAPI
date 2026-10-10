package main

import (
	"net/http"
	"runtime"
	"time"

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
				"code":    "database_error",
				"message": "Degraded: Unable to read simple stats from database.",
				"success": false,
				"api": gin.H{
					"go":  runtime.Version(),
					"gin": gin.Version,
				},
			})
			return
		}

		c.JSON(200, gin.H{
			"code":    "success",
			"message": "Pong!",
			"success": true,
			"database": gin.H{
				"uptime":  uptime.String(),
				"version": version,
			},
			"api": gin.H{
				"go":  runtime.Version(),
				"gin": gin.Version,
			},
		})
	}
}
