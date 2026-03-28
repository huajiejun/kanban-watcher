package tray

import _ "embed"

//go:embed icon_normal.png
var iconNormal []byte

//go:embed icon_alert.png
var iconAlert []byte

//go:embed icon_0.png
var icon0 []byte

//go:embed icon_1.png
var icon1 []byte

//go:embed icon_2.png
var icon2 []byte

//go:embed icon_3.png
var icon3 []byte

//go:embed icon_4.png
var icon4 []byte

//go:embed icon_5.png
var icon5 []byte

//go:embed icon_6.png
var icon6 []byte

//go:embed icon_7.png
var icon7 []byte

//go:embed icon_8.png
var icon8 []byte

//go:embed icon_9.png
var icon9 []byte

//go:embed icon_10.png
var icon10 []byte

//go:embed icon_11.png
var icon11 []byte

// instanceIcons 按实例数量索引的图标数组
var instanceIcons = [][]byte{
	icon0, icon1, icon2, icon3, icon4, icon5,
	icon6, icon7, icon8, icon9, icon10, icon11,
}

// getInstanceIcon 返回对应实例数量的图标
func getInstanceIcon(count int) []byte {
	if count < 0 {
		return icon0
	}
	if count > 11 {
		count = 11
	}
	return instanceIcons[count]
}
