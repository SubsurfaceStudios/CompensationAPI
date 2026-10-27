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
	Slot   OutfitSlot
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

func (pg *Postgres) CreateEmptyPlayer(c context.Context, username string, passwordHash string) (player *Player, err error) {
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

func (pg *Postgres) GetPlayerPublic(c context.Context, id uuid.UUID) (player *Player, err error) {
	player = &Player{
		Status: PlayerStatus{
			Room: &StatusRoom{},
		},
	}

	err = pg.pool.QueryRow(c,
		"SELECT "+
			"p.id, p.username, p.created, p.nickname, p.pronouns, p.tag, p.bio, "+
			"(instance.id IS NOT NULL) AS is_online, COALESCE(instance.is_public, false) AS in_public_instance, "+
			"room.id, room.name, room.created, room.description, room.visits, "+
			"room_owner.id, room_owner.username, room_owner.nickname, room_owner.pronouns "+
			"FROM player AS p "+
			"LEFT JOIN room_instance AS instance ON p.room_instance_id = instance.id "+
			"LEFT JOIN room ON instance.room_id = room.id "+
			"LEFT JOIN player AS room_owner ON room_owner.id = room.owner_id "+
			"WHERE p.id = $1;",
		id,
	).Scan(
		&player.ID, &player.Username, &player.Created, &player.Nickname, &player.Pronouns, &player.Tag,
		&player.Bio, &player.Status.IsOnline, &player.Status.InPublicInstance, &player.Status.Room.ID,
		&player.Status.Room.Name, &player.Status.Room.Created, &player.Status.Room.Description,
		&player.Status.Room.Visits, &player.Status.Room.Owner.ID, &player.Status.Room.Owner.Username,
		&player.Status.Room.Owner.Nickname, &player.Status.Room.Owner.Pronouns,
	)

	if err != nil {
		return nil, err
	}

	outfitRows, err := pg.pool.Query(
		c,
		"SELECT item.id AS id, item.name AS name, item.prefab AS prefab, "+
			"equipped_item.slot AS slot FROM equipped_item JOIN item ON "+
			"item.id = equipped_item.item_id WHERE equipped_item.player_id = $1;",
		id,
	)
	if err != nil {
		return nil, err
	}
	defer outfitRows.Close()

	outfit := make(map[OutfitSlot]OutfitItem)
	for outfitRows.Next() {
		var item OutfitItem

		err = outfitRows.Scan(&item.ID, &item.Name, &item.Prefab, &item.Slot)
		if err != nil {
			return nil, err
		}

		outfit[item.Slot] = item
	}

	player.Outfit = outfit

	return player, nil
}

func (pg *Postgres) GetPlayerID(c context.Context, username string) (id uuid.UUID, err error) {
	err = pg.pool.QueryRow(c, "SELECT id FROM player WHERE LOWER(username) = LOWER($1);", username).Scan(&id)

	return id, err
}
