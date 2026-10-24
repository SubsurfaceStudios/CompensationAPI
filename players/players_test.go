package players_test

import (
	"testing"

	"github.com/SubsurfaceStudios/CompensationAPI/database"
	"github.com/SubsurfaceStudios/CompensationAPI/testhelpers"
	"github.com/stretchr/testify/suite"
)

type PlayerTestSuite struct {
	suite.Suite
	container *testhelpers.PostgresContainer
	db        *database.Postgres
}

func (suite *PlayerTestSuite) SetupSuite() {
	container, err := testhelpers.CreatePostgresContainer(suite.T().Context())
	if err != nil {
		suite.T().Fatal(err)
		return
	}

	suite.container = container

	db, err := database.ConnectToPostgres(suite.container.ConnectionString)
	if err != nil {
		suite.container.Terminate(suite.T().Context())
		suite.T().Fatal(err)
		return
	}

	err = db.RunMigrations(suite.T().Context())
	if err != nil {
		suite.container.Terminate(suite.T().Context())
		suite.T().Fatal(err)
		return
	}

	suite.db = db
}

func (suite *PlayerTestSuite) TearDownSuite() {
	suite.db.Close()
	suite.container.Terminate(suite.T().Context())
}

func (suite *PlayerTestSuite) SetupSubTest(suiteName, testName string) {
	err := suite.container.Snapshot(suite.T().Context())
	if err != nil {
		suite.T().Fatal(err)
	}
}

func (suite *PlayerTestSuite) TearDownSubTest(suiteName, testName string) {
	err := suite.container.Restore(suite.T().Context())
	if err != nil {
		suite.T().Fatal(err)
	}
}

func TestSuitePlayer(t *testing.T) {
	suite.Run(t, new(PlayerTestSuite))
}
