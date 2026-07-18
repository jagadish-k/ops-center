---
name: neumorphism

description: Neumorphic or Neumorphism. Heavy soft-shadow craft guide. Learn match exact pixel color element to background so look like bump or dent. Light go top-left, shadow go bottom-right. No sharp edge allowed, only smooth round corner. Use config or raw utility code for quick dynamic flat push button, deep hole input field, and glow switch track. Alert on bad contrast danger for blind tribe members. Fix dark cave mode by no use pure black.
---

# Developer Skill Guide: Neumorphic UI Development with Tailwind CSS

## Overview & Core Principles

Neumorphism (Soft UI) is a design trend that bridges flat design and skeuomorphism. Instead of elements floating _above_ the background using traditional drop shadows, neumorphic elements appear to be extruded _from_ or indented _into_ the background itself.

The entire effect relies on a meticulous interplay of light, shadow, and color.

### The Golden Rules of Neumorphism

1. **Monochromatic Baseline:** The background color of the page and the surface color of the elements **must be exactly the same**. The illusion completely breaks if the element has a different background color than its parent container.
2. **Dual Shadow System:** Every neumorphic element requires two shadows placed diagonally from each other:
   - **Light Shadow:** Positioned facing the simulated light source (typically top-left), using a lighter tint or pure white with opacity.
   - **Dark Shadow:** Positioned away from the light source (typically bottom-right), using a darker shade of the background color.
3. **Soft, Desaturated Palettes:** High-contrast backgrounds (like pure white `#FFFFFF` or deep black `#000000`) do not work well because you cannot easily create a lighter or darker shade that feels organic. Use soft, desaturated pastels, mid-tone greys, or muted blues/greens.
4. **Subtle Radiancy:** Avoid sharp corners. Neumorphism relies heavily on rounded corners (`rounded-2xl`, `rounded-3xl`, or `rounded-full`) to let the simulated light wrap organically around edges.

---

## The Master Palette Setup

To achieve proper neumorphic effects without trial-and-error, configure these custom tokens in your `tailwind.config.js` file. This ensures consistent lighting ratios across your application.

```javascript
// tailwind.config.js
module.exports = {
	theme: {
		extend: {
			colors: {
				neumorphic: {
					// Soft, cool grey baseline
					bg: '#e0e8f6',
					// Subtle dark accent for text/active states
					dark: '#4a5568',
				},
			},
			boxShadow: {
				// Flat/Extruded Element (Light source from top-left)
				'neu-flat': '9px 9px 16px #be7ba, -9px -9px 16px #ffffff',
				// Smaller/Subtler Extruded Element
				'neu-flat-sm': '4px 4px 8px #be7ba, -4px -4px 8px #ffffff',

				// Sunken/Pressed Element (Used for active, checked, or inset fields)
				'neu-pressed': 'inset 9px 9px 16px #be7ba, inset -9px -9px 16px #ffffff',
				// Smaller Sunken Element
				'neu-pressed-sm': 'inset 4px 4px 8px #be7ba, inset -4px -4px 8px #ffffff',
			},
		},
	},
};
```

_Note on color math:_ If your baseline is `#e0e8f6`, your dark shadow should be roughly 10-15% darker (`#be7ba` or similar desaturated dark value), and your light shadow should always be pure white (`#ffffff`).

---

## Primitive Tailwinds Classes

If you prefer to write arbitrary values inline without modifying your Tailwind configuration file, use these utility combinations:

### 1. Extruded (Raised) Surface

- **Base Color:** `bg-[#e0e8f6]`
- **Shadows:** `shadow-[9px_9px_16px_#c8d2e6,-9px_-9px_16px_#ffffff]`
- **Rounded:** `rounded-2xl`

### 2. Sunken (Inset) Surface

- **Base Color:** `bg-[#e0e8f6]`
- **Shadows:** `shadow-[inset_9px_9px_16px_#c8d2e6,inset_-9px_-9px_16px_#ffffff]`
- **Rounded:** `rounded-2xl`

---

## Component Recipes & Code Snippets

Ensure the parent container of all the components below has the class `bg-[#e0e8f6]` (or your designated baseline color).

### 1. The Standard Interactive Button

A regular button that visibly pushes down into the screen when clicked.

```html
<button
	class="
  px-6 py-3
  bg-[#e0e8f6] 
  text-gray-700 font-medium 
  rounded-xl
  shadow-[6px_6px_12px_#c8d2e6,-6px_-6px_12px_#ffffff]
  transition-all duration-200 ease-in-out
  hover:shadow-[4px_4px_8px_#c8d2e6,-4px_-4px_8px_#ffffff]
  active:shadow-[inset_4px_4px_8px_#c8d2e6,inset_-4px_-4px_8px_#ffffff]
  focus:outline-none
">
	Click Me
</button>
```

### 2. Form Input Field

Inputs should look indented by default so the user intuitively knows they can fill them with data.

```html
<div class="w-full max-w-sm">
	<label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 ml-1"> Username </label>
	<input
		type="text"
		placeholder="Enter text..."
		class="
      w-full px-4 py-3
      bg-[#e0e8f6]
      text-gray-700 placeholder-gray-400
      rounded-xl
      shadow-[inset_6px_6px_12px_#c8d2e6,inset_-6px_-6px_12px_#ffffff]
      border-none
      focus:outline-none focus:ring-2 focus:ring-blue-400/30
      transition-all duration-200
    " />
</div>
```

### 3. The Toggle Switch

Perfect for application settings or light/dark switches.

```html
<label class="flex items-center cursor-pointer select-none">
	<div class="relative">
		<!-- Track -->
		<input
			type="checkbox"
			class="sr-only peer" />
		<div
			class="w-14 h-8 bg-[#e0e8f6] rounded-full shadow-[inset_4px_4px_8px_#c8d2e6,inset_-4px_-4px_8px_#ffffff]"></div>
		<!-- Thumb Knob -->
		<div
			class="
      absolute top-1 left-1 w-6 h-6 
      bg-[#e0e8f6] rounded-full 
      shadow-[2px_2px_5px_#c8d2e6,-2px_-2px_5px_#ffffff]
      transition-all duration-300 ease-in-out
      peer-checked:translate-x-6
      peer-checked:bg-blue-500
      peer-checked:shadow-none
    "></div>
	</div>
	<span class="ml-3 text-gray-700 font-medium">Toggle Settings</span>
</label>
```

### 4. Content Display Card

Cards hold text, images, or dashboards. They should remain static and soft.

```html
<div
	class="
  p-6 max-w-sm
  bg-[#e0e8f6]
  rounded-3xl
  shadow-[12px_12px_24px_#c8d2e6,-12px_-12px_24px_#ffffff]
">
	<h3 class="text-lg font-bold text-gray-800 mb-2">Neumorphic Card</h3>
	<p class="text-sm text-gray-600 leading-relaxed">
		This surface perfectly blends with its background environment, establishing structural hierarchy entirely through
		soft shadow manipulation.
	</p>
</div>
```

---

## Pitfalls & UX Anti-Patterns to Avoid

- **Accessibility / Contrast Issues:** Because neumorphic borders are shadows, users with visual impairments may struggle to differentiate fields from backgrounds. Always supplement components with explicit focus rings (`focus:ring-2`), high-contrast text typography, or icons.
- **Visual Overcrowding:** If every single element on your screen is popping out or recessed, the UI becomes unreadable. Balance neumorphic structural layouts with flat, clean interior text assets.
- **Bad Dark Mode Configurations:** Do not just invert colors to `#000` for dark mode. For a neumorphic dark mode, use a deep charcoal or slate baseline (`#1e293b`), using a pitch-black shadow (`#0f172a`) for the dark side and a subtly lighter slate shadow (`#334155`) for the light reflection side.
