package auth

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v4"
)

func TestGenerateAndValidateToken(t *testing.T) {
	service := NewJWTService("test-secret", 30)

	token, expiresAt, err := service.GenerateToken("admin")
	if err != nil {
		t.Fatalf("生成 token 失败: %v", err)
	}

	if token == "" {
		t.Error("token 不应为空")
	}

	// 验证过期时间约为 30 天
	expectedExpiry := time.Now().Add(30 * 24 * time.Hour)
	diff := expiresAt.Sub(expectedExpiry)
	if diff < -time.Hour || diff > time.Hour {
		t.Errorf("过期时间不正确，期望约 %v，得到 %v", expectedExpiry, expiresAt)
	}
}

func TestValidateToken_Valid(t *testing.T) {
	service := NewJWTService("test-secret", 30)

	token, _, err := service.GenerateToken("admin")
	if err != nil {
		t.Fatalf("生成 token 失败: %v", err)
	}

	claims, err := service.ValidateToken(token)
	if err != nil {
		t.Fatalf("验证 token 失败: %v", err)
	}

	if claims.Username != "admin" {
		t.Errorf("期望用户名 admin，得到 %s", claims.Username)
	}
}

func TestValidateToken_InvalidSignature(t *testing.T) {
	service := NewJWTService("test-secret", 30)
	wrongService := NewJWTService("wrong-secret", 30)

	token, _, _ := service.GenerateToken("admin")
	_, err := wrongService.ValidateToken(token)

	if err == nil {
		t.Error("期望验证失败，但成功了")
	}
}

func TestValidateToken_InvalidFormat(t *testing.T) {
	service := NewJWTService("test-secret", 30)

	_, err := service.ValidateToken("invalid-token")
	if err == nil {
		t.Error("期望验证失败，但成功了")
	}
}

func TestValidateToken_Expired(t *testing.T) {
	// 创建一个已过期的 token
	service := &JWTService{
		secret:          []byte("test-secret"),
		tokenExpireDays: -1, // 负数表示已过期
	}

	// 手动创建过期 token
	claims := &Claims{
		Username: "admin",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(-time.Hour)), // 1小时前过期
			IssuedAt:  jwt.NewNumericDate(time.Now().Add(-2 * time.Hour)),
			Issuer:    "kanban-watcher",
		},
	}
	tokenObj := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	token, _ := tokenObj.SignedString([]byte("test-secret"))

	_, err := service.ValidateToken(token)
	if err == nil {
		t.Error("期望 token 过期错误")
	}
}

func TestRefreshToken(t *testing.T) {
	service := NewJWTService("test-secret", 30)

	token, _, _ := service.GenerateToken("admin")

	// 等待一小段时间确保新 token 有不同的签发时间
	time.Sleep(time.Second) // 等待1秒确保签发时间不同

	newToken, _, err := service.RefreshToken(token)
	if err != nil {
		t.Fatalf("刷新 token 失败: %v", err)
	}

	if newToken == "" {
		t.Error("新 token 不应为空")
	}

	// 验证新 token 有效
	claims, err := service.ValidateToken(newToken)
	if err != nil {
		t.Fatalf("验证新 token 失败: %v", err)
	}

	if claims.Username != "admin" {
		t.Errorf("期望用户名 admin，得到 %s", claims.Username)
	}
}

func TestRefreshToken_InvalidToken(t *testing.T) {
	service := NewJWTService("test-secret", 30)

	_, _, err := service.RefreshToken("invalid-token")
	if err == nil {
		t.Error("期望刷新失败，但成功了")
	}
}
