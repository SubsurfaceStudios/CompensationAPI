package database

import (
	"testing"

	"github.com/SubsurfaceStudios/CompensationAPI/testhelpers"
	"github.com/stretchr/testify/assert"
)

func TestCreateConnectionPool(t *testing.T) {
	container, err := testhelpers.CreatePostgresContainer(t.Context())

	if err != nil {
		t.Error(err)
		return
	}

	defer container.PostgresContainer.Terminate(t.Context())

	pool, err := createConnectionPool(container.ConnectionString)

	if err != nil {
		t.Error(err)
		return
	}

	assert.NotNil(t, pool)
}
