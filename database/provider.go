package database

import (
	"context"

	"github.com/google/uuid"
)

type DB interface {
	Close()
	RunMigrations(c context.Context) error

	GetHealthInfo(c context.Context) (result HealthInfo, err error)

	CreateEmptyPlayer(c context.Context, username string, passwordHash string) (player *Player, err error)
	GetPlayerPublic(c context.Context, id uuid.UUID) (player *Player, err error)
}