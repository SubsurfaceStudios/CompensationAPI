package responses

import (
	"fmt"
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

func Err(c *gin.Context, message string) {
	c.JSON(
		http.StatusInternalServerError,
		Response{
			Success: false,
			Error: &ErrorInfo{
				Code:    "internal_server_error",
				Message: message,
			},
		},
	)
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

func Unimplemented(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, Response{
		Success: false,
		Error: &ErrorInfo{
			Code:    "unimplemented",
			Message: fmt.Sprintf("The endpoint '%s' is not implemented.", c.Request.URL.Path),
		},
	})
}

func OK(c *gin.Context, data any) {
	c.JSON(http.StatusOK, Response{
		Success: true,
		Data:    data,
	})
}
