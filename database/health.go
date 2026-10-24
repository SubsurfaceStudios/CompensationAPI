package database

import (
	"context"
	"time"
)

type HealthInfo struct {
	Uptime  time.Duration
	Version string
}

func (db *Postgres) GetHealthInfo(c context.Context) (result HealthInfo, err error) {
	result = HealthInfo{}

	err = db.pool.QueryRow(
		c,
		"SELECT now() - pg_postmaster_start_time() AS uptime, version() as version;",
	).Scan(&result.Uptime, &result.Version)

	return result, err
}
