# Porting Aetherfall to Unity

This is the plan for rebuilding Aetherfall in Unity, for **PC (keyboard and mouse) and Meta Quest VR**
(standalone, and PC VR through OpenXR). It is written for whoever does the work, most likely a Claude Code
session running on the computer that has Unity installed, and it assumes the reader can open the web
version's source in `src/` for details.

The web version stays as it is and keeps deploying from `main` to GitHub Pages. The Unity project lives in
`unity/` in this repository.

## Where things stand

| Done | Where |
| --- | --- |
| Every model the game needs, rebuilt in Blender: rigged and animated creatures and Pell, the four blades, gauntlets, shield, 30+ props | `art/export/fbx/` (Unity), `art/blend/` (editable sources), `art/previews/` |
| Per-model notes: animation clips and timings, sockets, hit spheres, colliders | `art/export/meta/<Name>.json` |
| The three islands and the distant ones, matching the web world exactly | `art/export/fbx/Island_*.fbx`, `FarIslands.fbx` |
| Where everything goes: props, scatter (trees, rocks, grass), spawns, landing and respawn points, currents, Pell | `art/export/layout.json` |
| The scripts that make all of the above | `art/build.py`, `art/assets/*.py` (see `art/README.md`) |

Nothing has been done in Unity yet. The web game's code in `src/` is the reference for behaviour and every
tuning number; this document points at the right file for each system.

## Decisions already made

- **Engine:** Unity 6 LTS (the newest 6000.x LTS in Unity Hub), Universal Render Pipeline.
- **Platforms:** Windows/macOS with keyboard and mouse; VR through OpenXR on Quest (Android, standalone) and PC VR.
- **Look:** the web game's low-poly, flat-shaded style. All colour lives in vertex colours, so one shader covers
  nearly everything (see [Shaders](#shaders)).
- **No root motion:** creatures are moved by game code, as in the web version; clips animate in place.

## 1. Create the project

1. In Unity Hub, install Unity 6 LTS with **Windows Build Support** (or Mac) and **Android Build Support**
   (with OpenJDK and Android SDK & NDK, which Quest needs).
2. Create a project at `unity/` in this repository from the **Universal 3D** template. (The **VR** template
   also works and comes with the XR packages set up; you then add desktop controls yourself.)
3. Add packages (Window > Package Manager):
   `com.unity.inputsystem`, `com.unity.xr.management`, `com.unity.xr.openxr`,
   `com.unity.xr.interaction.toolkit` (import its *Starter Assets* sample), and for Quest-specific features
   `com.unity.xr.meta-openxr`. TextMeshPro comes with uGUI.
4. Project Settings:
   - Player > Active Input Handling: **Input System Package (New)**. Colour Space: **Linear**.
   - XR Plug-in Management: enable **OpenXR** for Standalone and Android. For Android, add the **Meta Quest**
     feature group; add interaction profiles for Oculus Touch / Meta Quest Touch Plus (and Index/Vive for PC VR).
     Run **Project Validation** and fix what it flags (Android API levels, ARM64, IL2CPP, Vulkan).
   - Make two URP assets: **PC** (Forward+, MSAA 4x, HDR on, bloom allowed) and **Quest** (Forward, MSAA 4x,
     HDR off, no heavy post-processing). Assign them per platform in Quality settings.
5. Add a Unity `.gitignore` inside `unity/` (`Library/`, `Temp/`, `Obj/`, `Build*/`, `Logs/`, `UserSettings/`,
   `*.csproj`, `*.sln`). Keep **Visible Meta Files** and **Force Text** serialisation (the Unity 6 defaults).

## 2. Bring in the art

Copy `art/export/fbx/*.fbx`, `art/export/meta/*.json` and `art/export/layout.json` into
`unity/Assets/Aetherfall/Art/` (keep the `fbx/` and `meta/` subfolders). Do not copy the `.glb` files; they are for
the web viewer. To regenerate the art straight into the project later:

```bash
python art/build.py --out unity/Assets/Aetherfall/Art --no-preview --no-glb
```

Then add an `AssetPostprocessor` (Editor folder) for that folder that sets, for every model:

| Setting | Value | Why |
| --- | --- | --- |
| `bakeAxisConversion` | `true` | The FBX files come from Blender; this removes the -90 degree X rotation on import |
| `importNormals` | Import | Flat shading is baked into the normals |
| Materials | Remap `AF_VertexColor` to `M_VertexColor` and `AF_Glow` to `M_Glow` (see below) | One shared material keeps draw calls down |
| `animationType` | Generic for creatures, **Human** for `Pell` (T-pose, bone names match Unity's, avatar auto-maps), None for props | |
| Clips | Rename `Skitter|Walk` to `Walk` (strip up to the `|`); set `loopTime` from the meta JSON `loop` flag | |
| Animator | Apply Root Motion off | Clips animate in place |

Read `meta/<Name>.json` in the same postprocessor (or a menu command) to add gameplay data:

- **hitSpheres**: one trigger `SphereCollider` per entry, parented to the named bone. `center` is in the model
  root's space at the bind pose, so place it with `bone.InverseTransformPoint(root.TransformPoint(center))`.
  `damageMult` is the weak-point multiplier (the Warden's core is x3.2, but only while its vault doors are open).
- **sockets**: empty child transforms (the Shardling's `Eye` fires orbs, the Warden's `Core` fires volleys, the
  blades' `Base`/`Tip` give the sweep segment, the camp's `Lantern`/`Fire` take lights and VFX).
- **clips[].note**: which game state plays the clip and where its timing matters (for example, the Slam lands at 0.16 s).

### Shaders

Everything is coloured by vertex colour, one colour per face, like the web version. **RGB** is the colour, in sRGB.
**A** is an emission factor: 0 for ordinary surfaces, up to 1 for crystals, eyes and runes.

- **M_VertexColor** (URP Shader Graph, Lit, opaque): `Vertex Color` > `Colorspace Conversion` (RGB to Linear) >
  Base Color, multiplied by a `_Tint` colour property (default white). Emission = the converted colour x
  `Vertex Color.A` x `_EmissionStrength` (float, default 1.5; HDR, so it blooms on PC). Smoothness 0.15, Metallic 0.
  Enable GPU Instancing. The islands use this material too.
- **M_Glow** (Shader Graph, Unlit, Transparent, **Additive**, Render Face Both, no depth write): Colour = converted
  vertex colour x `_Intensity` (about 2), alpha = `Vertex Color.A`. Used by the blade glow shells and the hex shield.

### Build the world from `layout.json`

Write an editor command (Aetherfall > Build World) that reads `layout.json` and, under one root object:

1. Places each island model at `islands.<name>.position`, adds a `MeshCollider` to the island mesh, and either
   disables the `EdgeWall` child or keeps it as a collider (see the edge note below).
2. Instantiates `props` (prefab by `asset` name; island-local `position`, `yaw` in degrees, `scale`). Currents carry
   `to`, `label` and, for the gold one, `lockedLabel`/`unlock`.
3. Instantiates `scatter`. Each row is `[x, y, z, yaw, scale]` with optional `[r, g, b]` tint multipliers
   (island-local). Trees, rocks and crystals can be static GameObjects. Grass and flowers (900 to 1500 per island)
   should be drawn with `Graphics.RenderMeshInstanced` or a similar batched approach, especially on Quest.
4. Creates empty marker objects from `points` (`landing`, `waystoneSpawn`, `pell`, `arenaCentre`, `bossSpawn`,
   `skyKey`) and `spawns` (enemy type, position, count) for gameplay code to find.
5. Places `FarIslands` at the origin.

`edgeRadii` is the walkable radius of each island for every degree of `atan2(z, x)` in island space. The web game
keeps a grounded player inside `radius - 0.6` and slides them along the edge (`src/player/player.js` `moveXZ`,
`src/world/island.js` `clampInside`). Port that check rather than relying on the EdgeWall collider, so that
knockback can still throw the player off an island (the web game then respawns them at the last waystone).

**Done when:** the Build World command produces all three islands with every prop, tree and tuft where the web
game has them, and a free camera can fly around them.

## 3. System by system

| Web file | Unity |
| --- | --- |
| `src/main.js` (Game) | `GameManager`: a state machine with Title, Playing, Dialog, Paused, Travel, Dead and Ending; it owns saving, travel (fade, teleport to `landing`, repopulate enemies) and respawn |
| `src/core/input.js` | An Input System actions asset with Gameplay and UI maps and Keyboard&Mouse and XR control schemes |
| `src/player/player.js` | `CharacterController` FPS movement and stats (numbers below) |
| `src/player/hands.js`, `src/combat/combat.js` | `Blade` (sweep test between the Base/Tip sockets), `Combat` (damage, crits, hitstop, projectiles, deflection) |
| `src/enemies/*.js` | `Enemy` base plus one component per type; Animator Controllers map states to the clips in the meta JSON notes |
| `src/game/quests.js`, `src/game/npc.js` | `QuestManager` (event-driven, data from `QUESTS`), Pell's branching dialogue, `ShardUpgrades` |
| `src/game/save.js` | JSON in `Application.persistentDataPath`, same fields |
| `src/ui/hud.js`, `src/ui/panel.js` | A uGUI HUD for desktop; a world-space dialogue panel that works with the screen-centre ray and the XR ray; a wrist panel in VR |
| `src/world/sky.js` | Gradient skybox, sea of clouds at y = -72, fog (linear 170 to 1200 m, colour #b8cff7), `FarIslands` |
| `src/vr/xr.js` | XR Interaction Toolkit's XR Origin with the controls in the README |
| `src/core/audio.js` | Everything is synthesised live in the browser; see [Audio](#audio) |

### Numbers worth keeping (all from `src/`)

- **Movement:** walk 4.4 m/s, sprint 6.6, shield x0.55, gravity 20. Dodge: 13 m/s for 0.22 s, 0.3 s invulnerable,
  0.6 s cooldown. VR: 3.2 m/s, snap turn 30/45/60 degrees.
- **Stats:** HP 100 + 18 per level, aether 60 + 6 per level, XP to next level `round(40 x level^1.6)`, cap 20.
  HP regenerates 3/s after 7 s unhurt; aether 9/s after 1.2 s unused; the shield drains 2.2 aether/s.
- **Sword:** `11 x blade mult x (1 + 0.09 x (level - 1)) x power x random(0.92..1.08)`; in VR also
  `x clamp((tip speed - 1.5) / 4, 0.45, 1.6)`. 8% crits at x1.5. The 3-hit desktop combo resets after 0.45 s and
  the third hit has power 1.65. Blade multipliers: 1, 1.35, 1.8, 2.4 for 0, 18, 40, 80 shards.
- **Bolt:** 12 aether, 30 m/s, aim assist within 0.26 rad and 40 m, homing. Damage `16 x (1 + 0.1 x (level - 1)) x (1 + 0.15 x blade tier)`.
- **Shield:** blocks from the front (dot product > 0.3); you take 12% of the damage and pay 45% of it in aether.
- **Deflection:** swinging through an enemy orb sends it back at its source at 20 m/s for `max(30, damage x 2.6)`.
- **Enemies:** stats are in each `static def` in `src/enemies/types.js` and `warden.js`; the state timings are in their
  `think()` methods. The Warden enters phase 2 below 50% health (wind-ups x0.78) and summons at 66% and 33%.

### Three bugs in the web version not to carry over

1. **Pause did not pause.** Enemies, projectiles and health regeneration kept running behind the pause menu
   (`frame()` in `src/main.js`). In Unity, set `Time.timeScale = 0` while paused and keep UI on unscaled time.
2. **Pressing E to close Pell's last line re-opened the conversation**, because the dialogue and world interaction
   both read the same key press in one frame. Read Interact in one place, or ignore world interaction on the frame a
   dialogue closes. The same applies to the A button in VR.
3. **Losing mouse capture could break mouse look.** On browsers that refuse the raw-input pointer-lock option, the web
   game marked capture as failed for good, so it stopped auto-pausing and stopped re-capturing on click. In Unity: lock the
   cursor while playing and pause when the window loses focus (`OnApplicationFocus(false)`).

### Audio

The web game has no audio files; `src/core/audio.js` synthesises the music (five themes) and every effect with Web
Audio. Unity cannot run that code. The fastest faithful route is to render each effect and a few minutes of each
theme to WAV with an `OfflineAudioContext` (a small page that imports `audio.js`), then import the WAVs. The Verdant
theme's combat drums can be a second layer whose volume follows the number of nearby aggro'd enemies. Replacing the
audio with new work later is also fine.

## 4. Phases

Each phase ends with something playable. Commit at the end of each one.

1. **World (Phase 0).** Project, packages, shaders, art import, Build World. *Done when:* all three islands are built
   from `layout.json` in a scene.
2. **Skyreach slice (desktop).** Player controller with the edge clamp and falling, the sword combo against the
   training dummy (5 hits), Pell's dialogue and quest 1, HUD, pause, save and continue. *Done when:* a new game can
   finish *Steady Hands*, quit, and continue.
3. **Verdant Shelf.** Travel by current, Skitter, Thornback and Shardling with their AI and clips, bolt, shield,
   deflection, XP, levels and blade tempering, quest 2. *Done when:* *Thin the Swarm* can be completed and the gold
   current unlocks.
4. **Warden's Isle.** The Stone Warden with all 14 clips, both phases, summons and volleys, the Sky Key, the ending,
   quest 3. *Done when:* the chapter can be finished start to end on desktop.
5. **VR.** XR Origin, the blade on the right controller with speed-based damage, bolt and shield on the left, the wrist
   HUD and VR menu (snap angle, comfort vignette, sword angle), haptics. Test over Quest Link first, then a standalone
   Android build. *Done when:* the chapter can be finished in a headset.
6. **Polish.** Audio, VFX (sparks, shatter bursts, slam rings, damage numbers, current columns, the spire beam, blue
   brazier fire), the title screen, and a Quest performance pass: aim for 72 fps, use static batching and instancing,
   avoid realtime shadows or use one cascade, and turn on fixed foveated rendering.

## 5. Testing

Put game logic (damage, XP curve, quest transitions, save round-trip) in plain C# classes and cover them with Edit Mode
tests. Add a few Play Mode tests: the world builds from the layout, the player cannot walk off an edge, and travel lands on
the right island. Both run headless:

```bash
Unity -batchmode -projectPath unity -runTests -testPlatform EditMode -testResults editmode.xml
```

## A starting prompt for a Claude session on the Unity computer

> Read docs/unity-port.md and art/README.md in this repo. Unity 6 LTS is installed. Do Phase 0: create the Unity
> project in unity/ with the packages and settings in the plan, import the art with the postprocessor and the two
> shaders, and write the Build World command. Check compile errors by running Unity in batch mode, and show me the
> result when all three islands are built.
