package database

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	pgxUUID "github.com/vgarvardt/pgx-google-uuid/v5"
)

func createConnectionPool(connectionString string) (p *pgxpool.Pool, err error) {
	config, err := pgxpool.ParseConfig(connectionString)
	if err != nil {
		return nil, err
	}

	config.AfterConnect = func(ctx context.Context, conn *pgx.Conn) error {
		pgxUUID.Register(conn.TypeMap())
		return nil
	}

	return pgxpool.NewWithConfig(context.Background(), config)
}
