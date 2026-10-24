package database_test

import (
	"github.com/stretchr/testify/assert"
)

func (suite *DatabaseTestSuite) TestCreateValidPlayer() {
	const testUsername = "devtest"
	const testPassword = "CorrectHorseBatteryStaple"

	rows := suite.db.ListDatabases(suite.T().Context())
	suite.T().Log(rows)

	playerID, err := suite.db.CreatePlayer(
		suite.T().Context(),
		testUsername,
		testPassword,
	)

	if err != nil {
		suite.T().Error(err)
		return
	}
	assert.NotNil(suite.T(), playerID)
}
