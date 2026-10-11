package responses

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

type Response struct {
	Success bool       `json:"Success"`
	Data    any        `json:"Data,omitempty"`
	Error   *ErrorInfo `json:"Error,omitempty"`
	Meta    *Meta      `json:"Meta,omitempty"`
}

type ErrorInfo struct {
	Code    string `json:"Code"`
	Message string `json:"Message"`
}

type Meta struct {
	Page       int `json:"Page,omitempty"`
	PerPage    int `json:"PerPage,omitempty"`
	Total      int `json:"Total,omitempty"`
	TotalPages int `json:"TotalPages,omitempty"`
}

func Fail(c *gin.Context, status int, code string, message string) {
	c.JSON(status, Response{
		Success: false,
		Error: &ErrorInfo{
			Code:    code,
			Message: message,
		},
	})
}

func OK(c *gin.Context, data any) {
	c.JSON(http.StatusOK, Response{
		Success: true,
		Data:    data,
	})
}
