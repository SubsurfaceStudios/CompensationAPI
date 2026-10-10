package common

import (
	"context"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
)

func CreateConnectionPool() (p *pgxpool.Pool, err error) {
	config, err := pgxpool.ParseConfig(os.Getenv("DATABASE_URL"))
	if err != nil {
		return nil, err
	}

	return pgxpool.NewWithConfig(context.Background(), config)
}
