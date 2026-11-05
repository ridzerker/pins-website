# Public map visual parity

The Pins mobile app is the visual source of truth for `/@username`. `npm run test:marker-parity`
renders the app's real `components/PinsMarker.tsx` through react-native-web and compares it with the
website's marker, and runs the app's category, camera and style functions against the website's
copies. It needs the app repository beside this one, or `PINS_APP_DIR`, and skips without it.
Change the app first, then `src/lib/pins-marker.ts`, `src/lib/pins-map-style.ts` and the marker CSS.

Status: **Same** was checked by that test. **Device check** cannot be checked off a phone. **Differs**
is a known gap.

| Item | App | Website | Status |
|---|---|---|---|
| Frame, anchor | 50 x 54, bottom center | Same | Same |
| Body | 34 x 34, rotated -45°, corners 17/17/17/5, 2 px white border | Same | Same |
| Center and symbol | 24 px white circle, 16 px symbol, `#365943` text | Same | Same |
| Category colors | `normalizeCategoryColor`, 10 approved colors | Same function | Same |
| Category symbol | Emoji, else first letter, else `P`; old seed letters become the default emoji | Same, except that the public data has no `is_default`, so a custom category named exactly like a default and using its placeholder letter shows the default emoji | Same, one edge case |
| Selected | 46 px mint halo with `#365943` ring, 3 px border, 1.08 scale, drawn on top | Same | Same |
| Size at each zoom | Fixed, never scales with zoom | Same | Same |
| High-resolution screens | Vector | CSS, crisp at any scale; compared at 3x | Same |
| Marker shadow | iOS shadow, radius 4 at 14%, radius 6 at 18% when selected | CSS blur of 8 px and 12 px | Device check |
| Emoji artwork | Apple Color Emoji | The visitor's system emoji: identical on iPhone and Mac, different art on Windows and Android | Differs by device |
| Clustering | None | None up to 300 pins | Same up to 300 |
| Above 300 pins | Draws every pin | Clusters into a Pins marker with a count, because browsers cannot move thousands of DOM markers per frame | Differs on purpose |
| Overview camera | Fit with padding 44/32/32/32, one pin at zoom 11, shortest arc over the date line | Same | Same |
| Selecting a pin | Center at zoom 14 in 250 ms (Home's behavior) | Same | Same |
| Rotation, pitch | Rotation on, compass only when rotated, pitch off | Same (rotate with right-drag or two fingers) | Same |
| Zoom buttons | None, pinch only | Kept for mouse and keyboard users | Differs on purpose |
| Base map, Android | MapTiler Basic with the Pins palette | Same style code when a website key is configured | Same (needs a key) |
| Base map, iOS | Apple MapKit `mutedStandard` with Pins POI filters | Not reproducible in MapLibre: Apple's tiles and styling cannot be copied | Differs |

## Base map options

Apple's map data and renderer are only available through Apple's own APIs, so MapLibre can match the
Android map but not the iOS one. Apple's web product is MapKit JS, which offers `mutedStandard` and
point-of-interest filters. Using it would add a second renderer, an Apple-issued token, a load from
Apple's servers and a privacy-policy change, so it needs an explicit decision. The marker is plain DOM
and can be reused by either renderer.
