package auth

import (
	"os"
)

var TokenSigningKey = os.Getenv("TOKEN_SIGNING_KEY")

func GetTokenSigningKey() string {
	val, exists := os.LookupEnv("TOKEN_SIGNING_KEY")

	if !exists {
		panic("Expected environment variable TOKEN_SIGNING_KEY to be present.")
	}

	return val
}
