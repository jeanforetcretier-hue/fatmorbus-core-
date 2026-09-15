# Fatmorbus Core — By Fatmorbus

Central workspace, welcome hub, compendium organizer, and signed release-verification layer for Foundry VTT modules **By Fatmorbus**.

## Compatibility
- Foundry VTT **v13** (minimum)
- Foundry VTT **v14** (verified)

## Features
- Supported-system panel using the official D&D 5e and Shadowdark logos, linked to their Foundry VTT package pages.
- Redesigned 2048 × 1060 Fatmorbus presentation hub with Supported Systems, Recognized Modules, and Social Media areas.
- Module tools and settings panels render above normal Foundry windows for immediate access.
- All By Fatmorbus compendium packs are grouped inside one virtual **FATMORBUS** folder in the native Compendium Directory.
- The Fatmorbus presentation opens on **every Foundry world load** unless the client checks the bottom opt-out checkbox.
- Refined **black-and-white** welcome hub with improved contrast and a cleaned social footer strip.
- One consolidated **Herramientas By Fatmorbus** control in the left Scene Controls bar.
- Updated **Fatmorbus Core** welcome hub with a compact links section and a bottom opt-out checkbox.
- **Recognized Modules** panel with direct actions for module settings and configuration.
- **Module Console** with detected By Fatmorbus modules and their registered tools.
- **Settings Center** which discovers standard Foundry module settings and settings submenus.
- **Fatmorbus Library**, a virtual searchable index across By Fatmorbus compendiums.
- Drag documents from the virtual library using their original Compendium UUIDs.
- Non-destructive **FATMORBUS virtual folders** inside Foundry's native Compendium Directory.
- Signed release verification using RSA + SHA-256 integrity manifests.
- Shared links for Discord, YouTube, Instagram, and Patreon.
- Foundry VTT compatibility declared for v13 and v14.
- Fixed 1456 x 816 design canvas, uniformly scaled: the hub layout is identical at any resolution.

## Non-destructive library design
Fatmorbus Core does **not** copy, rename, move, or merge source compendiums. The Library and Compendium folders are a UI/index layer. Original pack IDs and document UUIDs remain authoritative.

## Integration API
See **INTEGRATION.md** for the full, ordering-proof integration contract.

The recommended registration channel does not require Fatmorbus Core to be installed at all:

```js
Hooks.once("init", () => {
  Hooks.callAll("fatmorbusRegisterModule", {
    id: "my-fatmorbus-module",
    name: "My Module — By Fatmorbus",
    iconClass: "fa-solid fa-skull",
    tools: [{ id: "open-tool", label: "Open Tool", icon: "fa-solid fa-wrench", action: () => openMyTool() }]
  });
});
```

`globalThis.FatmorbusCore` and `game.fatmorbus` remain available:

```js
game.fatmorbus?.registerModule({
  id: "my-fatmorbus-module",
  name: "My Module — By Fatmorbus",
  tools: [
    {
      id: "open-tool",
      label: "Open Tool",
      icon: "fa-solid fa-wrench",
      action: () => openMyTool()
    }
  ],
  sceneControls: [
    { control: "tokens", tool: "my-old-tool" }
  ]
});
```

`sceneControls` is optional. When declared and the Core setting is enabled, those legacy buttons can be hidden from Scene Controls so the Fatmorbus button becomes the consolidated access point.

## Official links
- Discord: https://discord.gg/uEc36zgrrM
- YouTube: https://www.youtube.com/@Fatmorbus/videos
- Instagram: https://www.instagram.com/fatmorbus_studio/
- Patreon: https://www.patreon.com/c/FatmorbusStudio/home

## Installation

### From a manifest URL (recommended)
1. In Foundry VTT, open **Add-on Modules → Install Module**.
2. Paste this manifest URL:

   ```
   https://raw.githubusercontent.com/jeanforetcretier-hue/fatmorbus-core-/main/module.json
   ```

3. Enable **Fatmorbus Core — By Fatmorbus** in the world.

### Manual installation
1. Close Foundry VTT.
2. Extract `fatmorbus-core-by-fatmorbus` directly into `FoundryVTT/Data/modules/`.
3. Start Foundry VTT.
4. Enable **Fatmorbus Core — By Fatmorbus** in the world.
5. Use the **Herramientas By Fatmorbus** control from the left Scene Controls bar to access the ecosystem.

## Signing
This build ships **without** `fatmorbus-integrity.json`. Re-sign it with the Fatmorbus protection kit before distributing, otherwise Core reports itself as `unsigned`.
