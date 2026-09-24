# Camera still attribution

The photographs staged under `media/cameras/<camera_id>/still.*` are **Caterpillar product
photography**, supplied by the team for this prototype. They are **not** output from any camera in
this system, and no tile presents them as one — each is captioned "staged frame" over the image
itself.

They are Caterpillar's copyright, used here to demonstrate a Caterpillar-facing prototype. They are
**not committed to the repository** (see `.gitignore`); they live on the machine running the demo.
Anyone cloning this repo gets the SVG mocks in `still.svg` until they stage their own files.

| Camera | Staged frame |
|---|---|
| `cam-ex-07` | Cat cab, forward view through the windscreen |
| `cam-ex-09` | Cat operator station, wide |
| `cam-ex-11` | Cat operator station, seat and controls |
| `cam-yard-01` | Operator at the controls, wide worksite view |

To stage your own: drop a file at `media/cameras/<camera_id>/still.jpg` (`.png`, `.webp` and `.svg`
also work). It is served on the next request — nothing to register, no restart. Delete it to fall
back to that camera's `still.svg` mock.
