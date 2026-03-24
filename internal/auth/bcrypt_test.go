package auth

import "testing"

func TestHashAndVerifyPassword(t *testing.T) {
	password := "my-secret-password"

	hash, err := HashPassword(password)
	if err != nil {
		t.Fatalf("哈希密码失败: %v", err)
	}

	if hash == "" {
		t.Error("哈希不应为空")
	}

	if hash == password {
		t.Error("哈希不应等于原始密码")
	}
}

func TestVerifyPassword_Correct(t *testing.T) {
	password := "my-secret-password"
	hash, _ := HashPassword(password)

	if !VerifyPassword(password, hash) {
		t.Error("期望密码验证成功")
	}
}

func TestVerifyPassword_Incorrect(t *testing.T) {
	password := "my-secret-password"
	hash, _ := HashPassword(password)

	if VerifyPassword("wrong-password", hash) {
		t.Error("期望密码验证失败")
	}
}

func TestVerifyPassword_EmptyHash(t *testing.T) {
	if VerifyPassword("password", "") {
		t.Error("期望空哈希验证失败")
	}
}

func TestHashPassword_DifferentHashes(t *testing.T) {
	password := "same-password"

	hash1, _ := HashPassword(password)
	hash2, _ := HashPassword(password)

	// bcrypt 每次生成不同的哈希（因为有随机盐）
	if hash1 == hash2 {
		t.Error("相同密码的两次哈希应该不同（bcrypt 盐值）")
	}

	// 但两个哈希都应该能验证原始密码
	if !VerifyPassword(password, hash1) {
		t.Error("hash1 应该能验证密码")
	}
	if !VerifyPassword(password, hash2) {
		t.Error("hash2 应该能验证密码")
	}
}
