# Robotea

High-five a robot or shoot at a range with your real hands. Your webcam moves a first-person Optimus, solo or with a friend online.

Play: https://robotea.gzowo.fun (a computer with a webcam, Chrome, Brave or Safari)

## Modes

- **High five**: clap hands with a robot that holds its palms up, or with a friend in another room. Make a fist for a fist bump.
- **Shooting range**: make a finger gun, move your hand to aim, drop your thumb or flick up to shoot. Glock 17, Beretta 92, Colt 1911, Desert Eagle, .357 revolver, Uzi, MAC-10 or the finger gun itself, one in each hand. Paper ring targets at 4, 7 and 10 m and swinging steel gongs. Online, friends shoot in lanes side by side.

## Keys

`1` to `8` guns, `N` new targets, `R` reload, `G` gun picker, `M` switch mode, `C` recalibrate, `D` stats.

## How it works

three.js 0.170 from a CDN, no build step. MediaPipe Hand Landmarker tracks both hands in the browser, so the camera image never leaves your computer. Online rooms find each other through ntfy.sh and then talk over a direct WebRTC link.

## Credits

- Sounds: freesound.org, CC0, listed in `assets/sfx/CREDITS.md`
- HDRI: studio_small_08 from Poly Haven, CC0
- Hand tracking model: MediaPipe Hand Landmarker, Apache 2.0
