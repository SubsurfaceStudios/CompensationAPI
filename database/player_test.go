package database_test

import (
	"testing"

	"github.com/SubsurfaceStudios/CompensationAPI/database"
	"github.com/SubsurfaceStudios/CompensationAPI/testhelpers"
	"github.com/stretchr/testify/assert"
)

func TestCreateValidPlayer(t *testing.T) {
	container, err := testhelpers.CreatePostgresContainer(t.Context())
	if err != nil {
		t.Error(err)
		return
	}
	defer container.PostgresContainer.Terminate(t.Context())

	pool, err := database.CreateConnectionPool(container.ConnectionString)
	if err != nil {
		t.Error(err)
		return
	}
	defer pool.Close()

	const testUsername = "devtest"
	const testPassword = "CorrectHorseBatteryStaple"

	playerID, err := database.CreatePlayer(t.Context(), pool, testUsername, testPassword)

	if err != nil {
		t.Error(err)
		return
	}
	assert.NotNil(t, playerID)
}
