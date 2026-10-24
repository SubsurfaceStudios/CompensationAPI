package database_test

import (
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func (suite *DatabaseTestSuite) TestCreateEmptyPlayer() {
	const testUsername = "devtest"
	const testPassword = "CorrectHorseBatteryStaple"

	// TODO password should be hashed first,
	// but since this is just a test it doesn't matter
	// too much for now

	player, err := suite.db.CreateEmptyPlayer(
		suite.T().Context(),
		testUsername,
		testPassword, // we should hash this first to match real usage
	)

	if err != nil {
		suite.T().Error(err)
		return
	}
	suite.NotNil(suite.T(), player)
	suite.Equal(player.Username, testUsername) // check username matches
	suite.Equal(player.Nickname, testUsername) // check nickname matches
	suite.Empty(player.Tag)                    // newly-created accounts shouldn't have a tag
}

func (suite *DatabaseTestSuite) TestGetValidPlayer() {
	testId := uuid.MustParse("00000000-0000-0000-0000-000000000000")

	result, err := suite.db.GetPlayerPublic(
		suite.T().Context(),
		testId,
	)

	suite.Nil(err)
	suite.NotNil(result)

	suite.Equal(result.ID, testId)
	suite.Equal(result.Username, "system")
	suite.Equal(result.Nickname, "Sierra")
	suite.Equal(result.Tag, "Official")
	suite.Equal(result.Pronouns, "It / Its")
	suite.Equal(result.Bio, "This is the official account of Sierra!")
}

func (suite *DatabaseTestSuite) TestGetNonexistentPlayer() {
	testId, err := uuid.NewV7()

	suite.Nil(err)

	result, err := suite.db.GetPlayerPublic(
		suite.T().Context(),
		testId,
	)

	suite.NotNil(err)
	suite.ErrorIs(err, pgx.ErrNoRows)
	suite.Nil(result)
}
