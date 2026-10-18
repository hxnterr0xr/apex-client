# Apex Client
- apex-client/      launcher (Modrinth mods/packs/shaders, Fabric, auto-installs Apex HUD + Fabric API)
- apex-hud/         Fabric mod for 1.20.1
- apex-hud-1.21.11/ Same HUD for 1.21.11 (to add a version: copy this folder, change versions, fix code): FPS, CPS, coordinates, WASD keys (Right Shift toggles)
- apex-downloader/  small ApexDownloader.exe that fetches the latest launcher

## Release (no local setup needed)
1. Make a GitHub repo named apex-client and upload this whole folder's contents.
2. In apex-downloader/config.json replace YOUR-GITHUB-NAME with your GitHub username.
3. Go to Actions > Build Apex > Run workflow (or push a tag like v1.0.0).
4. Download ApexClient-Setup.exe and ApexDownloader.exe from the Releases page.
