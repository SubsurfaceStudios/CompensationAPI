package database

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Player struct {
	ID      uuid.UUID
	Created time.Time

	Username string
	Nickname string

	Pronouns string
	Tag      string
	Bio      string

	Status struct {
		IsOnline         bool       `json:"IsOnline"`
		InPublicInstance bool       `json:"InPublicInstance"`
		Room             statusRoom `json:"Room,omitzero"`
	}

	Outfit map[string]outfitItem
}

type outfitItem struct {
	ID     uuid.UUID
	Name   string
	Prefab string
	Slot   string
}

type statusRoom struct {
	ID          *uuid.UUID      `json:"ID,omitempty"`
	Name        *string         `json:"Name,omitempty"`
	Created     *time.Time      `json:"Created,omitempty"`
	Description *string         `json:"Description,omitempty"`
	Visits      *int            `json:"Visits,omitempty"`
	Owner       statusRoomOwner `json:"Owner,omitzero"`
}

type statusRoomOwner struct {
	ID       *uuid.UUID `json:"ID,omitempty"`
	Username *string    `json:"Username,omitempty"`
	Nickname *string    `json:"Nickname,omitempty"`
	Pronouns *string    `json:"Pronouns,omitempty"`
}

func CreatePlayer(c context.Context, pool *pgxpool.Pool, username string, password string) (playerID *uuid.UUID, err error) {
	return nil, errors.New("Unimplemented")
}
