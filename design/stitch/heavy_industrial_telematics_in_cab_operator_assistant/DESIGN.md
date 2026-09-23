---
name: Heavy Industrial Telematics & In-Cab Operator Assistant
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#393939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#201f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353534'
  on-surface: '#e5e2e1'
  on-surface-variant: '#d1c5ab'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#9a9078'
  outline-variant: '#4e4632'
  surface-tint: '#f1c100'
  primary: '#ffeec6'
  on-primary: '#3d2f00'
  primary-container: '#ffcd11'
  on-primary-container: '#6f5800'
  inverse-primary: '#745b00'
  secondary: '#ffb691'
  on-secondary: '#552000'
  secondary-container: '#ff751b'
  on-secondary-container: '#5d2400'
  tertiary: '#c0ffb7'
  on-tertiary: '#003909'
  tertiary-container: '#94e68d'
  on-tertiary-container: '#166920'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffe08a'
  primary-fixed-dim: '#f1c100'
  on-primary-fixed: '#241a00'
  on-primary-fixed-variant: '#574400'
  secondary-fixed: '#ffdbcb'
  secondary-fixed-dim: '#ffb691'
  on-secondary-fixed: '#341100'
  on-secondary-fixed-variant: '#793100'
  tertiary-fixed: '#a3f69c'
  tertiary-fixed-dim: '#88d982'
  on-tertiary-fixed: '#002204'
  on-tertiary-fixed-variant: '#005312'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353534'
  cat-yellow: '#FFCD11'
  cat-yellow-active: '#F6B800'
  carbon-surface: '#1E1E1E'
  slate-panel: '#262626'
  slate-border: '#3A3A3A'
  slate-muted: '#757575'
  hazard-red: '#E03A3A'
  hazard-amber: '#FFA000'
  safety-green: '#2E7D32'
  operator-white: '#FFFFFF'
typography:
  display-lg:
    fontFamily: Barlow Condensed
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 52px
    letterSpacing: 0.02em
  display-lg-mobile:
    fontFamily: Barlow Condensed
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: 0.02em
  headline-xl:
    fontFamily: Barlow Condensed
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: 0.01em
  headline-lg:
    fontFamily: Barlow Condensed
    fontSize: 26px
    fontWeight: '600'
    lineHeight: 30px
    letterSpacing: 0.01em
  headline-md:
    fontFamily: Barlow Condensed
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: 0.02em
  body-xl:
    fontFamily: Noto Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
  body-lg:
    fontFamily: Noto Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Noto Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Noto Sans
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  label-lg:
    fontFamily: Barlow Condensed
    fontSize: 18px
    fontWeight: '700'
    lineHeight: 22px
    letterSpacing: 0.06em
  label-md:
    fontFamily: Barlow Condensed
    fontSize: 15px
    fontWeight: '700'
    lineHeight: 18px
    letterSpacing: 0.08em
  label-sm:
    fontFamily: Barlow Condensed
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.1em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-tablet: 1.25rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-tablet: 1.5rem
  margin-desktop: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

The design system is engineered for smart operator interfaces, rugged telematics consoles, and heavy machinery field environments. Targeted at heavy equipment operators, fleet supervisors, and site engineers, the interface prioritizes immediate comprehension under extreme physical circumstances: direct sunlight glare, night shifts, severe vehicle vibration, and gloved operation.

The visual style blends **High-Contrast Industrial Functionalism** with **Tactile Rugged Modernism**. Visual elements evoke forged steel, heavy-duty instrumentation, and geometric safety perimeters. Micro-interactions must convey absolute mechanical certainty—no ambiguous transitions, zero ornamental fluff, and zero non-functional glassmorphic distractions. Every pixel, outline, and container reinforces machine telemetry, operator safety, and zero-latency situational awareness.

## Colors

The system uses a persistent dark operational mode to combat eye fatigue during extended multi-shift cab operations and maximize daylight visibility via selective hyper-chromatic accents.

- **Primary (`#FFCD11`)**: The quintessential heavy-equipment yellow. Reserved strictly for primary operational state indicators, vital telemetry readouts, dominant actions, and active machine statuses. It commands immediate optical priority.
- **Secondary (`#FF6F00`)**: Safety Orange. Deployed for dynamic machine advisories, high-torque alerts, secondary overrides, and cautionary payload tracking.
- **Tertiary (`#2E7D32`)**: Telemetry Confirmation Green. Designated for operational nominal states, automated guidance locks, and verified safety clearances.
- **Neutral (`#121212`)**: Industrial deep carbon baseline. Complemented by `#1E1E1E` (surface modules) and `#262626` (elevated control trays) to build non-reflective physical depth.
- **Named Safety Colors**: Hazard Alert Red (`#E03A3A`) for critical machine stop/obstacle warnings, and Hazard Amber (`#FFA000`) for perimeter sensors and mechanical warnings.

Avoid low-contrast grey-on-black text. All instructional labels maintain a minimum contrast ratio of 7:1 against dark chassis panels to ensure complete outdoor legibility.

## Typography

Typography delivers brutal, unambiguous clarity under harsh ambient lighting and in-cab vibration. 

- **Display & Headline Hierarchy (`Barlow Condensed`)**: Selected for its sturdy, industrial character reminiscent of heavy machinery manufacturing plates and gauges. It conserves horizontal spatial efficiency while delivering robust vertical impact. All headline and label levels leverage an assertive uppercase treatment for machine commands, payload metrics, and dynamic fault codes.
- **Body Content (`Noto Sans`)**: Provides humanist neutrality and rapid line scanning for technical descriptions, checklist workflows, and machine health diagnostics.
- **Data & Readout Metrics**: Telemetric readouts must utilize tabular figures (`font-variant-numeric: tabular-nums`) to prevent optical jitter when hydraulic, RPM, grade, and payload values fluctuate rapidly.

## Layout & Spacing

The layout logic relies on an armored, rigid grid designed to conform to multi-aspect cab screens (such as 10-inch rugged tablets, 12-inch embedded consoles, and auxiliary displays).

- **Screen Layout**: A strict 12-column responsive fluid grid anchored by perimeter framing. Critical machine parameters and master e-stop/payload indicators stay affixed to peripheral rails, preventing occlusion during dynamic card switching.
- **Hit-Box Disciplines**: All interactive touch surfaces strictly maintain a minimum physical hit box of 48×48px (expanding to 56px or 64px for core operational controls) to accommodate heavy leather work gloves and vehicle cabin shock.
- **Spacing Rhythm**: Spacing is metric and mechanical, based on an 8px root grid (with 4px for micro-adjustments). Outer margins preserve dedicated visual dead-zones along bezel edges to guard against accidental palm actuation during rough transit.

## Elevation & Depth

Visual hierarchy rejects ethereal drop shadows, blurry diffusion, and delicate ambient light cones. In dirty, bright industrial workspaces, soft shadows wash out completely. 

Depth is expressed through **Tonal Armor Stacking** and **Machined Inset Contours**:
- **Chassis Level (0dp)**: Base substrate (`#121212`), dead matte, non-reflective.
- **Module Enclosure (1dp)**: Structural card surfaces (`#1E1E1E`) framed by a solid 1px or 2px edge line (`#3A3A3A`).
- **Elevated Control Trays (2dp)**: Interactive buttons and primary sensor blocks (`#262626`) framed by a deliberate mechanical top highlight (`#4A4A4A` 1px inset border) and dark baseline anchor (`#000000` 2px offset border), creating a stamped industrial keycap appearance.
- **Active State / Warning Focus**: Depth is heightened through high-visibility perimeter bounding bands (`#FFCD11` or `#E03A3A` 2px solid boundary) rather than blur, ensuring the operator's peripheral vision immediately catches state changes.

## Shapes

The design system enforces a disciplined, low-radius contour profile (`0.25rem` / `4px`) referencing machine tooling, laser-cut steel plates, and armored chassis enclosures. Excessive rounding or pill shapes are avoided as they imply soft consumer electronics and compromise usable touch boundary areas.

Hexagonal chamfers (45-degree angled edge cuts) may be selectively applied to high-priority alert cards, operator authentication badges, and HUD telemetry corner brackets. Standard containers maintain crisp 4px corners to maximize internal data density.

## Components

### Buttons & Industrial Action Bars
- **Primary Operational Action**: Fill of `#FFCD11` with bold `#121212` text in `Barlow Condensed`, solid 4px radius, minimum 52px height. When pressed or activated, transitions to `#F6B800` with a sharp inset border.
- **Secondary Control**: Dark chassis plate `#262626`, solid `#FFCD11` or `#757575` 2px border, `#FFFFFF` text.
- **Emergency / Hazard Stop**: Heavy `#E03A3A` surface, thick mechanical border, high-contrast white warning typography, accompanied by industrial cross-hatch corner markers.

### Telemetry Cards & Module Containers
- Rendered with an impenetrable `#1E1E1E` background and a `#3A3A3A` 1px perimeter border.
- Cards feature upper mechanical title bars displaying sensor taxonomy, real-time connectivity status, and a 45-degree chamfered indicator chip.
- Critical telemetry metrics feature oversized `Barlow Condensed` numbers paired with tiny, fixed-width metric units (e.g., `kN`, `RPM`, `PSI`, `°C`).

### Chips & Sensor Status Flags
- Angular 2px corner radius, bold condensed text, all-caps.
- Backgrounds leverage darkened tone states with hyper-chromatic solid status dots: nominal green (`#2E7D32`), intermediate caution amber (`#FFA000`), and critical lockout red (`#E03A3A`).

### Inputs, Toggles & Stepper Selectors
- Sliders and input bars are designed as robust physical tracks with chunky, high-friction thumb handles (minimum 32px width) that remain effortless to manipulate with physical gloves.
- Toggle switches adopt physical rocker designs with dual-state color verification: dead slate when inactive, illuminated `#FFCD11` when active.

### Checkboxes & Segmented Touch Controls
- Generous touch regions (minimum 48px square). Checked state displays a solid high-contrast `#FFCD11` interior with a thick `#121212` checkmark glyph.
- Segmented selectors mimic industrial dash-switch clusters, with crisp 1px separation lines between segments.