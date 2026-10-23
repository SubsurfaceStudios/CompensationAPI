package auth

import (
	"crypto/rand"
)

func GenerateSessionSecret() string {
	return rand.Text()
}
