package players

import (
	"regexp"
	"time"

	"github.com/SubsurfaceStudios/CompensationAPI/database"
	"github.com/SubsurfaceStudios/CompensationAPI/responses"
	"github.com/gin-gonic/gin"
)

const usernamePattern = `^[a-zA-Z][a-zA-Z0-9\-\_]{2,31}$`
const passwordMinLength = 8
const passwordMaxLengthBytes = 256

// NOTE: May want to look into shortening this in the
// future, but it's not a massive concern at this time.
// Ideally, we want to make sure VR users almost never
// have to re-authenticate, to encourage stronger
// passwords that are harder to type in VR.
const sessionExpirationTime = 60 * 24 * time.Hour
const tokenExpirationTime = time.Hour

var usernameRegex = regexp.MustCompile(usernamePattern)

// type registerPlayerForm struct {
// 	Username string `json:"username" form:"username" binding:"required"`
// 	Password string `json:"password" form:"password" binding:"required"`
// }

// type playerSession struct {
// 	Secret   string
// 	PlayerID uuid.UUID
// 	Began    time.Time
// 	Expires  time.Time
// 	Name     string
// }

func RegisterPlayer(db database.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		responses.Unimplemented(c)
		// read input from request body
		// var form registerPlayerForm
		// if err := c.ShouldBind(&form); err != nil {
		// 	responses.Fail(
		// 		c,
		// 		http.StatusBadRequest,
		// 		"missing_field",
		// 		"You did not provide a username or password in the request body.",
		// 	)
		// 	return
		// }

		// // validate username
		// if !usernameRegex.MatchString(form.Username) {
		// 	responses.Fail(
		// 		c,
		// 		http.StatusUnprocessableEntity,
		// 		"invalid_username",
		// 		fmt.Sprintf("The username you provided (%s) was invalid. ", form.Username)+
		// 			"Usernames must be between 3 and 32 characters, start with "+
		// 			"a letter, and consist only of alphanumeric characters, "+
		// 			"hyphens, and underscores.",
		// 	)
		// 	return
		// }

		// // ensure there is not a user who already has the username they are requesting
		// existingRow := pool.QueryRow(c, "SELECT id FROM player WHERE lower(username) = lower($1);", form.Username)
		// var existingId uuid.UUID
		// if err := existingRow.Scan(&existingId); err != pgx.ErrNoRows {
		// 	responses.Fail(
		// 		c,
		// 		http.StatusConflict,
		// 		"username_taken",
		// 		fmt.Sprintf("An account already exists with the username you requested (%s).", form.Username),
		// 	)
		// 	println(err.Error())
		// 	return
		// }

		// // validate password: by that, just make sure it's not insanely
		// // short or long, we don't even actually validate that it's
		// // any specific subset of UTF-8 since that's not really our business
		// // and it'll be hashed as raw bytes anyway
		// passwordLengthBytes := len(form.Password)
		// if passwordLengthBytes < passwordMinLength {
		// 	responses.Fail(
		// 		c,
		// 		http.StatusUnprocessableEntity,
		// 		"password_too_short",
		// 		"The password you provided was too short: passwords must be at least 8 bytes (usually characters) long.",
		// 	)
		// 	return
		// }

		// // make sure password isn't inordinately long
		// // this isn't really necessary, it's mostly just a sanity check
		// if passwordLengthBytes > passwordMaxLengthBytes {
		// 	responses.Fail(
		// 		c,
		// 		http.StatusUnprocessableEntity,
		// 		"password_too_long",
		// 		"The password you provided was too long.",
		// 	)
		// 	return
		// }

		// // hash password
		// passwordHash, err := argon2id.CreateHash(form.Password, argon2id.DefaultParams)
		// if err != nil {
		// 	responses.Err(c, "An error occurred while hashing your password. Please try again with another password.")
		// 	println(err.Error())
		// 	return
		// }

		// // acquire postgres connection from pool
		// conn, err := pool.Acquire(c)
		// if err != nil {
		// 	responses.Err(c, "Unable to acquire database connection from pool.")
		// 	println(err.Error())
		// 	return
		// }
		// // make sure to release connection back to pool when done
		// defer conn.Release()

		// // begin transaction where we'll set up the player's account
		// tx, err := conn.Begin(c)
		// if err != nil {
		// 	responses.Err(c, "Unable to begin database transaction.")
		// 	println(err.Error())
		// 	return
		// }
		// // make sure transaction will be rolled back if something goes wrong
		// defer tx.Rollback(c)

		// // first, create the player object itself
		// rows, err := tx.Query(
		// 	c,
		// 	"INSERT INTO player (id, username, password_hash, nickname) VALUES "+
		// 		"(uuidv7(), $1, $2, $1) RETURNING id;",
		// 	form.Username,
		// 	passwordHash,
		// )

		// if err != nil || !rows.Next() {
		// 	responses.Err(c, "Unable to create entry in 'player' table.")
		// 	println(err.Error())
		// 	return
		// }

		// var newPlayerId uuid.UUID
		// if err := rows.Scan(&newPlayerId); err != nil {
		// 	responses.Err(c, "Unable to read new player object from database response.")
		// 	println(err.Error())
		// 	return
		// }
		// rows.Close()

		// // Now that we have the ID of the newly-created Player,
		// // we can use it to start setting up the default objects
		// // associated with them!

		// // First up: Every player gets their own instance of the
		// // Apartment, so we quickly create that here.

		// // Create the actual Room instance
		// rows, err = tx.Query(
		// 	c,
		// 	"INSERT INTO room (id, owner_id, name) VALUES"+
		// 		"(uuidv7(), $1, 'Apartment') RETURNING id;",
		// 	newPlayerId,
		// )

		// if err != nil || !rows.Next() {
		// 	responses.Err(c, "Unable to create Apartment for new player account.")
		// 	println(err.Error())
		// 	return
		// }

		// var apartmentId uuid.UUID
		// if err := rows.Scan(&apartmentId); err != nil {
		// 	responses.Err(c, "Unable to read new Apartment ID from database response.")
		// 	println(err.Error())
		// 	return
		// }
		// rows.Close()

		// // TODO add home subroom and subroom_version to apartment so it actually loads

		// // Set the player's spawn_room to the new apartment
		// rows, err = tx.Query(c, "UPDATE player SET spawn_room = $1 WHERE id = $2;", apartmentId, newPlayerId)
		// if err != nil {
		// 	responses.Err(c, "Unable to set player spawn room to new Apartment ID.")
		// 	println(err.Error())
		// 	return
		// }
		// rows.Close()

		// // Create an "everyone" role for the Apartment
		// _, err = tx.Query(
		// 	c,
		// 	"INSERT INTO room_role (room_id, name, can_view) VALUES ($1, 'everyone', false);",
		// 	apartmentId,
		// )

		// if err != nil {
		// 	responses.Err(c, "Unable to initialize roles for player Apartment.")
		// 	println(err.Error())
		// 	return
		// }

		// // Create an initial session for the player.
		// sessionSecret := auth.GenerateSessionSecret()
		// sessionName := c.Request.UserAgent()
		// session := playerSession{}
		// rows, err = pool.Query(
		// 	c,
		// 	"INSERT INTO player_session (secret, player_id, began, expires, name) VALUES "+
		// 		"($1, $2, NOW(), NOW() + $3, $4) RETURNING secret, player_id, began, expires, name;",
		// 	sessionSecret, newPlayerId, sessionExpirationTime, sessionName,
		// )

		// if err != nil {
		// 	responses.Err(c, "Unable to create initial auth session for player.")
		// 	println(err.Error())
		// 	return
		// }

		// if !rows.Next() {
		// 	responses.Err(c, "Unable to get info about initial auth session for player.")
		// 	println(rows.Err().Error())
		// 	return
		// }

		// err = rows.Scan(
		// 	&session.Secret,
		// 	&session.PlayerID,
		// 	&session.Began,
		// 	&session.Expires,
		// 	&session.Name,
		// )
		// rows.Close()

		// if err != nil {
		// 	responses.Err(c, "Unable to read session data from database response while creating account.")
		// 	println(err.Error())
		// 	return
		// }

		// // Create an initial JWT for the player.
		// signingKey := auth.GetTokenSigningKey()
		// now := time.Now()
		// tokenExpiresAt := now.Add(tokenExpirationTime)

		// tokenClaims := jwt.RegisteredClaims{
		// 	Issuer:    os.Getenv("BASE_DOMAIN"),
		// 	Subject:   newPlayerId.String(),
		// 	ExpiresAt: jwt.NewNumericDate(tokenExpiresAt),
		// 	NotBefore: jwt.NewNumericDate(now),
		// 	IssuedAt:  jwt.NewNumericDate(now),
		// }

		// token := jwt.NewWithClaims(jwt.SigningMethodHS256, tokenClaims)
		// signedToken, err := token.SignedString(signingKey)

		// if err != nil {
		// 	responses.Err(c, "Unable to sign initial authentication token (JWT).")
		// 	println(err.Error())
		// 	return
		// }

		// if err := tx.Commit(c); err != nil {
		// 	responses.Err(c, "Unable to commit database transaction.")
		// 	println(err.Error())
		// 	return
		// }

		// responses.OK(c, gin.H{
		// 	"Player": gin.H{
		// 		"ID":       newPlayerId,
		// 		"Username": form.Username,
		// 		"Nickname": form.Username,
		// 	},
		// 	"SpawnRoomID": apartmentId,
		// 	"Session":     session,
		// 	"Token": gin.H{
		// 		"Value":     signedToken,
		// 		"ExpiresIn": tokenExpirationTime.Seconds(),
		// 		"ExpiresAt": tokenExpiresAt.Unix(),
		// 	},
		// })
	}
}
