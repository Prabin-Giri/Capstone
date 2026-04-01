# Design System Strategy: The Academic Lens

## 1. Overview & Creative North Star
**Creative North Star: "The Digital Curator"**

This design system is built to transform complex institutional data into a prestigious, editorial experience. We are moving away from the "software utility" look and toward a high-end academic publication. The aesthetic balances the gravity of university integrity with a modern, glassmorphic interface that feels breathable, light-filled, and authoritative.

To achieve this, the system breaks the traditional rigid grid through **Intentional Asymmetry**. By utilizing overlapping glass surfaces and varying levels of background blur, we create a sense of physical depth. Large-scale serif typography (Newsreader) serves as a sophisticated anchor against a functional, modern sans-serif (Manrope), establishing an immediate hierarchy of "The Narrative" versus "The Data."

---

## 2. Colors & Surface Philosophy

### The Palette
The core brand identity is driven by **Warhawk Red (#840029)** and **Heritage Gold (#FDB913)**. In this system, these are not mere accents; they are emotional cues.
- **Primary (Warhawk Red):** Used for critical status and primary actions.
- **Secondary (Heritage Gold):** Used for warnings and highlighting "moments of interest."
- **Neutrals:** The background starts at a deep, obsidian `surface` (#121317), providing a canvas for the frosted glass elements to glow.

### The "No-Line" Rule
Explicitly prohibit 1px solid borders for sectioning. Boundaries must be defined solely through background color shifts or tonal transitions. To separate the sidebar from the main investigation view, use a shift from `surface` to `surface-container-low`.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers. 
- **Layer 0 (Background):** `surface` (#121317)
- **Layer 1 (Main Panels):** `surface-container-low` (#1b1b1f)
- **Layer 2 (Glass Cards):** Semi-transparent `surface-container-high` (#292a2e) at 60% opacity with a `24px` backdrop-blur.

### The "Glass & Gradient" Rule
For floating elements or status cards, use Glassmorphism. A primary card should transition subtly from `primary-container` (#840029) to a slightly more transparent variant. This adds a "visual soul" that flat colors cannot achieve, mimicking the way light passes through stained glass or high-end acrylic.

---

## 3. Typography

The typographic system is a dialogue between tradition and technology.

*   **Editorial Authority (Display & Headlines):** Use **Newsreader**. This serif typeface brings the weight of a physical transcript or university charter. 
    *   *Usage:* Investigation titles, "The Smoking Gun" headers, and high-level stats.
*   **Functional Precision (Body & Labels):** Use **Manrope**. A clean, geometric sans-serif that ensures data density remains readable.
    *   *Usage:* Code snippets, sidebar queues, and metadata.

**Scale Highlight:** 
- `display-lg`: 3.5rem (Newsreader) - For total flag counts.
- `title-sm`: 1rem (Manrope) - For sidebar investigation names.

---

## 4. Elevation & Depth

### The Layering Principle
Depth is achieved through **Tonal Layering** rather than structural lines. Place a `surface-container-lowest` card on a `surface-container-low` section to create a soft, natural "recessed" look. Conversely, stack a `surface-container-highest` card to create "lift."

### Ambient Shadows
When an element must float (e.g., a modal or a primary action menu), use "Ambient Shadows":
- **Blur:** 40px to 60px.
- **Opacity:** 6% - 10%.
- **Color:** Use a tinted version of `on-surface` (#e3e2e7) to simulate natural light dispersion rather than a muddy black shadow.

### The "Ghost Border" Fallback
If accessibility requires a container edge, use a **Ghost Border**: `outline-variant` (#584143) at **15% opacity**. This provides a guide for the eye without creating a hard visual "stop."

---

## 5. Components

### Glassmorphic Cards
Cards are the heart of the dashboard.
- **Styling:** `surface-container-highest` at 70% opacity.
- **Corner Radius:** `xl` (0.75rem) for main cards; `md` (0.375rem) for nested items.
- **Interaction:** On hover, increase opacity to 90% and add a subtle `Heritage Gold` ghost border (10% opacity).

### Investigation Queue (Sidebar)
- **Structure:** No dividers. Use `spacing-3` (1rem) as vertical breathing room between items.
- **Active State:** Use a vertical "light bar" of `Warhawk Red` on the left edge and a shift to `surface-container-high`.

### Status Chips
- **Critical:** `primary-container` background with `on-primary-container` text.
- **Warning:** `secondary-container` background with `on-secondary` text.
- **Shape:** Use the `full` (9999px) roundedness scale for a pill shape.

### Code Comparison View
- **Background:** `surface-container-lowest` (#0d0e12).
- **Highlighting:** Instead of bright yellow highlights, use `primary-container` at 30% opacity for matched code segments to maintain the dark, academic aesthetic.

---

## 6. Do's and Don'ts

### Do
- **Do** use `spacing-8` and `spacing-10` to create dramatic whitespace around "The Smoking Gun" or primary evidence.
- **Do** use backdrop-blur on all navigation overlays and floating cards.
- **Do** prioritize the Newsreader serif for any text that tells a story or delivers a verdict.

### Don't
- **Don't** use 1px solid borders to separate the sidebar from the main content. Use a background tone shift.
- **Don't** use pure white (#FFFFFF) for text. Use `on-surface` (#e3e2e7) to reduce eye strain in high-contrast dark environments.
- **Don't** use standard drop shadows. If it doesn't look like ambient light, it doesn't belong in this system.
- **Don't** use "flat" buttons for primary actions. Use a subtle linear gradient of `Warhawk Red`.