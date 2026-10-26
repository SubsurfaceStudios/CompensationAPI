package players_test

import (
	"net/http"
	"net/http/httptest"

	"github.com/SubsurfaceStudios/CompensationAPI/routing"
)

func (suite *PlayerTestSuite) TestGetUserByIDTable() {
	router := routing.SetupRouter(suite.db)

	tests := []struct {
		name     string
		method   string
		path     string
		wantCode int
		wantBody string
	}{
		{"system account", http.MethodGet, "/players/00000000-0000-0000-0000-000000000000", http.StatusOK, ""},
		{"invalid UUID", http.MethodGet, "/players/this-isnt-a-real-uuid", http.StatusBadRequest, ""},
		{"nonexistent player", http.MethodGet, "/players/11111111-1111-1111-1111-111111111111", http.StatusNotFound, ""},
	}

	for _, tt := range tests {
		suite.Run(tt.name, func() {
			w := httptest.NewRecorder()
			req, _ := http.NewRequest("GET", tt.path, nil)
			router.ServeHTTP(w, req)

			suite.Equal(tt.wantCode, w.Code)
			if tt.wantBody != "" {
				suite.Equal(tt.wantBody, w.Body.String())
			}
		})
	}
}
