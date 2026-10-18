# Apex Client
Free, open launcher with built-in Modrinth mod / texture pack / shader installer and Fabric support.

## Run
    npm install
    npm start          # dev
    npm run dist       # build installer

## Notes
- Sign-in uses a real Microsoft account that owns Minecraft (Mojang EULA). No offline/cracked mode.
- Modrinth API needs no key. CurseForge needs a free API key from console.curseforge.com and its terms
  require approval for third-party launchers; add it later as a second source in `search`/`install` in main.js.
- Game files live in the app's userData/game folder (mods/, resourcepacks/, shaderpacks/).
- TODO ideas: Forge/NeoForge, profiles, dependency resolution for mods, skin viewer, news feed.
