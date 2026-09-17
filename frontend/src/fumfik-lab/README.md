# Fumfik Lab (Experimental)

This is a separate Angular entry point, available only to active administrators.
The top account toolbar links to it. It edits the same version 2 renderer used
by new trophy awards, the collection, congratulations and the login characters.
Versions 0 and 1 retain their original images and keys.
`npm run build` still builds only Kids Quiz; the runtime staging task builds and
includes both applications, placing the lab at `public/fumfik-lab`.

Build the complete local runtime from the repository root:

```sh
./gradlew stageDockerImageContext --no-daemon
```

Run it as described in the root README. Sign in as an administrator, then use
the lab icon in the upper toolbar or open `http://127.0.0.1:18101/fumfik-lab/`.
The backend protects both the HTML and all lab assets, with no-store caching.
Anonymous visitors return to login; other users receive 403. The standalone
unauthenticated development server is no longer an entry point.

```sh
npm run build:fumfik-lab
npm run test:fumfik
```

After building the backend jar, run the HTTP access tests from the root:

```sh
node --test backend/tests/fumfik-lab-access.test.mjs
```

The access tests start a temporary backend with an isolated disposable database.

The seven appearance parameters match the existing generated trophy enums.
Selections are represented in the URL fragment, not persisted to the database.
The original 40 static SVG assets are not converted or modified.

## Expressions

`FumfikComponent` takes an appearance `spec` and a continuous `pose`. Each eye
is one persistent path: blinking deforms it into an eyelid, and the clipped
highlights disappear. The mouth is also one persistent path; teeth and tongue
are clipped to its actual opening. There is no covering face or replacement
image. Right/left refer to the character, not the viewer.

The lab can play, pause, scrub or hold a reaction. Rapidly starting another
reaction cancels the previous frame loop and interpolates from the current pose.

Additional reactions rotate the existing ears around their attachment points,
enlarge the original nose (with room made by the eyes and mouth), or extend the
same tongue through the mouth opening. They share the duration, intensity and
timeline controls. Ear wiggles oscillate in both directions before settling.

Whole-head reactions include shaking "no", nodding "yes", hopping, inflating
and a complete 360-degree spin. One parent SVG group moves the head, ears and
face together while the background stays still. All animations return to rest;
the spin completes its forward turn instead of unwinding backwards. The lab's
hold option freezes a representative pose (half a turn for the spin).
