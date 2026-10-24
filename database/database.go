package database

import (
	"context"
	"embed"
	"path"

	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed migrations/*.sql
var migrations embed.FS

type Postgres struct {
	pool *pgxpool.Pool
}

func ConnectToPostgres(connStr string) (db *Postgres, err error) {
	pool, err := createConnectionPool(connStr)

	if err != nil {
		return nil, err
	}

	return &Postgres{pool}, nil
}

func (db *Postgres) Close() {
	db.pool.Close()
}

func (db *Postgres) RunMigrations(c context.Context) error {
	entries, err := migrations.ReadDir("migrations")
	if err != nil {
		return err
	}

	for _, entry := range entries {
		bytes, err := migrations.ReadFile(path.Join("migrations/", entry.Name()))
		if err != nil {
			return err
		}

		str := string(bytes)

		_, err = db.pool.Exec(c, str)
		if err != nil {
			return err
		}
	}

	return nil
}
