# Fumfik Versions

The stored `animal_key` is the source of truth for both identity and version:

| Version | Key | Rendering |
| --- | --- | --- |
| 0 | `animal-01` through `animal-40` | Original static SVG assets |
| 1 | `generated:` followed by seven canonical parameters | Original backend SVG renderer and URL |
| 2 | `generated-v2:` followed by seven canonical parameters | Inline Angular SVG renderer from Fumfik Lab |

Existing rows, keys, award timestamps and assets are not migrated or rewritten.
The trophy API adds `version` and `spec`, derived from the key. Version 2 has
`imagePath: null`; it must never fall back to the version 1 renderer.
New awards select only unwon version 2 keys. The database primary key
`(user_id, animal_key)` also prevents duplicate ownership of the same identity.
The legacy award selector is retained only for existing migration behavior.

`FumfikAvatarComponent` dispatches rendering by version. Login characters are
local version 2 appearances, never trophy awards. Their random reactions use
the same pose functions as the lab, avoid immediate repetition and restore rest.
Reaction progress is transient, not part of the appearance key or database.

Login hover movement belongs to `LoginFumfiksComponent`, not to the generic
button hover transform. A non-interactive outer element owns position/rotation;
its button only plays expressions. Mouse entry starts a 1.1-second move and a
1.5-second cooldown. The whole movement corridor avoids the login panel and
leaderboard, and its destination avoids other characters. Touch taps do not move the target; reduced-motion users
get no position animation and only subtle facial reactions.

Preserve the version 0 assets and version 1 renderer when changing version 2.
A future incompatible appearance change must use a new version and key prefix.
