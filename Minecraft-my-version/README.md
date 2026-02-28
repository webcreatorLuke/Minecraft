# BlockCraft - Minecraft-like Game

A voxel-based 3D game inspired by Minecraft, built with Three.js.

## Controls

- **W** - Move forward
- **A** - Move left  
- **S** - Move backward
- **D** - Move right
- **Space** - Jump
- **Mouse** - Look around (click to lock pointer)
- **ESC** - Pause menu / Back

## How to Run

Open `index.html` in a modern web browser. For best experience, use a local server:

```bash
# Using Python 3
python -m http.server 8000

# Or using Node.js (npx)
npx serve .
```

Then visit `http://localhost:8000` in your browser.

## Features

- **Main Menu** - Play and Settings buttons
- **Settings** - Minecraft-style options:
  - **Video**: Fullscreen, GUI Scale, Brightness, FOV
  - **Graphics**: Render distance, quality, smooth lighting, framerate, view bobbing, clouds, particles
  - **Controls**: Mouse sensitivity, invert Y, auto jump
  - **Music & Sounds**: Master, music, ambient, blocks, hostile creature volumes
  - **Accessibility**: Subtitles, distortion effects, FOV effects
- **ESC Pause Menu** - Back to Game, Options, Save and Quit
- **Collision** - No falling through blocks, proper gravity and ground detection
