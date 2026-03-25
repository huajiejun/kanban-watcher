// Package auth 提供 JWT 认证功能
package auth

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v4"
)

// Claims JWT 声明
type Claims struct {
	Username string `json:"username"`
	jwt.RegisteredClaims
}

// JWTService JWT 服务
type JWTService struct {
	secret          []byte
	tokenExpireDays int
}

// NewJWTService 创建 JWT 服务
func NewJWTService(secret string, tokenExpireDays int) *JWTService {
	return &JWTService{
		secret:          []byte(secret),
		tokenExpireDays: tokenExpireDays,
	}
}

// GenerateToken 生成 JWT Token
func (s *JWTService) GenerateToken(username string) (token string, expiresAt time.Time, err error) {
	expiresAt = time.Now().AddDate(0, 0, s.tokenExpireDays)

	claims := &Claims{
		Username: username,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "kanban-watcher",
		},
	}

	tokenObj := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	token, err = tokenObj.SignedString(s.secret)
	return
}

// ValidateToken 验证 JWT Token
func (s *JWTService) ValidateToken(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return s.secret, nil
	})

	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(*Claims); ok && token.Valid {
		return claims, nil
	}

	return nil, errors.New("invalid token")
}

// RefreshToken 刷新 Token（返回新 token）
func (s *JWTService) RefreshToken(tokenString string) (token string, expiresAt time.Time, err error) {
	claims, err := s.ValidateToken(tokenString)
	if err != nil {
		return "", time.Time{}, err
	}
	return s.GenerateToken(claims.Username)
}
