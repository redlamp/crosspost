# Recording the tour

Renders the introduction to a video without filming a screen: headless Chrome under BeginFrame
control and virtual time, so every tick moves the page's timers, animations, and view transitions
by exactly one sixtieth of a second and renders one frame. Frames go straight to ffmpeg, which
stitches them at a steady 60fps. Nothing here is part of the site's build.

## Run

```
bun run build
cd tools/record-tour
npm install
npx playwright install chromium
cd ../..
node tools/record-tour/record.mjs
```

Install from inside the folder, as above: `npm install --prefix tools/record-tour` from the repo
root links the site itself into the tool's `node_modules`, and that symlink loop breaks the
site's build.

The video lands at `tools/record-tour/out/tour-1200.mp4` (1200x1092, H.264, about 74 seconds);
pass another path as the first argument to put it elsewhere. The renders are for sharing (social
media), not for the repo: `out/` here is ignored by git. Rendering takes about 12 minutes. ffmpeg must be
on the PATH. `npm install` fetches the Playwright library into this folder (the site's own
dependencies stay as they are), and `playwright install chromium` fetches Playwright's Chromium
with its headless shell, which supports BeginFrame control (the Chrome channel's headless
doesn't); it's a one-time download, kept outside the repo.

## The frame

The dialog with a 16px border on every side, centered: 896 by 812.4 CSS pixels, the size of every
step with a drawing. A style put in for the recording centers the dialog (the app pins it near the
top), and on Done, which is shorter, holds the top edge where the taller steps had it. The page is
zoomed 1.4x inside a viewport that is the frame in real pixels (BeginFrame screenshots come at the
viewport's size whatever the device scale factor), so text renders at 1.4x and the real viewport
stays past the xl breakpoint, where the dialog is 896 wide.

The take starts half a second before the click on the Start here card and holds five seconds on
Done. `frames.mjs` has the knobs (frame size, border, pre-roll, hold, output width).
