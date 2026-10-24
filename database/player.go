package database

import (
	"context"
	"time"

	"github.com/google/uuid"
)

type Player struct {
	ID      uuid.UUID
	Created time.Time

	Username string
	Nickname string

	Pronouns string
	Tag      string
	Bio      string

	Status PlayerStatus

	Outfit map[OutfitSlot]OutfitItem
}

type PlayerStatus struct {
	IsOnline         bool        `json:"IsOnline"`
	InPublicInstance bool        `json:"InPublicInstance"`
	Room             *StatusRoom `json:"Room,omitempty"`
}

type OutfitSlot string
type OutfitItem struct {
	ID     uuid.UUID
	Name   string
	Prefab string
	Slot   string
}

type StatusRoom struct {
	ID          *uuid.UUID `json:"ID,omitempty"`
	Name        *string    `json:"Name,omitempty"`
	Created     *time.Time `json:"Created,omitempty"`
	Description *string    `json:"Description,omitempty"`
	Visits      *int       `json:"Visits,omitempty"`
	Owner       RoomOwner  `json:"Owner,omitzero"`
}

type RoomOwner struct {
	ID       *uuid.UUID `json:"ID,omitempty"`
	Username *string    `json:"Username,omitempty"`
	Nickname *string    `json:"Nickname,omitempty"`
	Pronouns *string    `json:"Pronouns,omitempty"`
}

func (pg *Postgres) ListDatabases(c context.Context) []string {
	var result []string = []string{}

	rows, _ := pg.pool.Query(c, "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';")
	for rows.Next() {
		var name string
		rows.Scan(&name)
		result = append(result, name)
	}

	return result
}

func (pg *Postgres) CreatePlayer(c context.Context, username string, passwordHash string) (player *Player, err error) {
	tx, err := pg.pool.Begin(c)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(c)

	p := Player{}
	err = tx.QueryRow(c,
		"INSERT INTO player (id, username, password_hash, nickname) VALUES "+
			"(uuidv7(), $1, $2, $1) RETURNING "+
			"id, created, username, nickname, pronouns, tag, bio;",
		username, passwordHash,
	).Scan(
		&p.ID, &p.Created, &p.Username, &p.Nickname, &p.Pronouns,
		&p.Tag, &p.Bio,
	)

	if err != nil {
		return nil, err
	}

	p.Status = PlayerStatus{
		IsOnline:         false,
		InPublicInstance: false,
	}

	return &p, nil
}

func (pg *Postgres) GetPlayer(c context.Context, id uuid.UUID) {
	
}
