# Yuniverse

`JUST大猫`、`JUST外星猫` 与 `珉鸟` 组成的柳智敏衍生桌宠小宇宙。`Yu` 对应柳智敏韩文名字中的音节，并与 `universe` 组合成 `Yuniverse`；名字不限定成员必须是猫或鸟，今后加入其他衍生形象也能自然容纳。运行打包后的程序不需要 Codex、ChatGPT、Node.js 或其他开发环境，也不会连接网络。

## 下载

- [Yuniverse 官网（Cloudflare）](https://yuniverse411.pages.dev)
- [小白安装指南](https://yuniverse411.pages.dev/#install)
- [Yuniverse 备用镜像（GitHub Pages）](https://au-cu.github.io/Yuniverse/)
- [GitHub Release v1.0.0](https://github.com/Au-Cu/Yuniverse/releases/tag/v1.0.0)

官网会分架构提供 Windows 与 macOS 成品；体积较大的文件会依次下载、校验分片，再由浏览器合成为完整安装包。GitHub Release 同时保留各平台原始安装包、Windows 便携版和 SHA-256 校验文件。

## 使用

- 拖动桌宠：按住左键拖到桌面任意位置。
- 招手：单击猫咪。
- 切换成员：双击桌宠会按 `JUST大猫 → JUST外星猫 → 珉鸟` 循环切换。
- 更多功能：右键桌宠，或右键系统托盘图标。
- 鼠标移动时，桌宠会以 16 个方向转头跟随；两只猫保留收敛后的转头素材，珉鸟使用同一张高清脸部母版派生方向帧。
- 鼠标停下约 0.75 秒，或检测到键盘输入时，桌宠会水平走到鼠标所在的竖直线上。目标会按当前窗口宽度限制在屏幕可达范围内，因此鼠标贴近左右边缘时不会反复撞墙。
- 到达后如果仍在打字，两只猫会坐下；珉鸟的坐下与普通状态合并，仍保持睁眼。键鼠约 15 秒没有输入时，桌宠才会进入闭眼睡觉动作并保持。
- 珉鸟的普通状态使用轻微呼吸动作，左右行走使用双脚交替摆动的禽类迈步，并配合轻微前倾与点头节奏；招手改为单翅挥动。
- 保留的互动动作只有招手、坐下和睡觉；不再随机跳跃、工作或播放其他动作。
- 透明区域会点击穿透，不遮挡桌宠轮廓之外的桌面。
- 右键菜单可在 45%、60%、75%、90%、105% 五档间调整大小；75% 是本版的原始/默认比例。

## 安装与直接运行

Windows ARM64 设备使用 `Yuniverse-Setup-1.0.0.exe`，普通 Intel/AMD 电脑使用 `Yuniverse-Setup-1.0.0-Windows-x64.exe`。对应的 `Portable` 文件无需安装；安装版会创建名为 `Yuniverse` 的桌面与开始菜单快捷方式。

macOS Intel 设备使用 `Yuniverse-macOS-x64-1.0.0.dmg`，Apple Silicon（M1 及更新芯片）使用 `Yuniverse-macOS-arm64-1.0.0.dmg`。打开镜像后将 Yuniverse 拖入“应用程序”。当前 macOS 包采用 ad-hoc 签名，尚未使用 Apple Developer ID 公证；第一次打开若被系统阻止，请在“系统设置 → 隐私与安全性”中核对应用名称后选择“仍要打开”。

为避免 Windows/NSIS 在部分中文代码页环境中把路径转成乱码，安装文件、真正的主程序、桌面快捷方式与界面统一使用纯英文名 `Yuniverse`。

当前 1.0.0 提供 Windows ARM64、Windows x64、macOS Intel x64 和 macOS Apple Silicon arm64。程序没有商业代码签名证书，因此 Windows 可能显示“未知发布者”或 SmartScreen 提示；请只运行发布页内、且 SHA-256 与 `SHA256SUMS.txt` 一致的文件。

设置保存在 `%APPDATA%\Yuniverse\settings.json`，不会上传。第一次运行会自动从 `%APPDATA%\JUSTPet\settings.json`、更早的 `%APPDATA%\just-cats-desktop-pet\settings.json` 或早期中文目录迁移设置。数据目录继续使用纯英文名，避免中文代码页导致路径乱码。

## 从源码构建

需要 Node.js 24 或兼容版本：

```powershell
npm install
npm test
npm run build
```

`npm run build` 生成当前 Windows 架构的便携版；`npm run dist` 同时生成便携版与安装版。macOS 成品必须在对应的 macOS 构建机上生成；仓库中的跨平台工作流会分别使用原生 Intel 与 Apple Silicon 构建机进行打包和冒烟测试。

项目固定使用 electron-builder 26.15.3。其原始 NSIS 模板遗漏了单一 ARM64 `useZip` 分支，`prebuild`/`predist` 会先运行一个严格匹配的局部修补；若上游模板发生变化，脚本会直接失败而不会生成空壳程序。

## 素材规范

三张运行时精灵表均为 v2 格式：1536×2288、8 列×11 行、单格 192×208。两只猫继续使用原图中的待机、行走、招手、睡觉和 16 向转头，并以独立透明精灵条替换顶部连续七个方向帧；坐姿是独立的 192×208 透明帧。

珉鸟的高清透明母版、闭眼休息、单翅招手和禽类迈步关键姿势保存在 `assets/source`，运行时图集由 `npm run build:minbird-assets` 在 Windows 上确定性生成。行走循环与方向帧只复用这些母版做缩放、镜像、轻微旋转和重心位移，不逐帧重生脸部。
