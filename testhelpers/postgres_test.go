package testhelpers_test

import (
	"testing"

	"github.com/SubsurfaceStudios/CompensationAPI/testhelpers"
	"github.com/stretchr/testify/assert"
)

func TestCreatePostgresContainer(t *testing.T) {
	container, err := testhelpers.CreatePostgresContainer(t.Context())

	if err != nil {
		t.Error(err)
	}

	assert.Nil(t, err)
	assert.NotNil(t, container)

	container.PostgresContainer.Terminate(t.Context())
}
