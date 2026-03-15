# Tailwind CSS — Utility-First Fundamentals

Tailwind CSS is a utility-first CSS framework packed with classes like `flex`, `pt-4`, `text-center` and `rotate-90` that can be composed to build any design, directly in your markup.

## Why Utility-First?

With Tailwind, you style elements by applying pre-existing classes directly in your HTML.

```html
<div class="max-w-sm mx-auto bg-white rounded-xl shadow-lg flex items-center space-x-4 p-6">
  <div class="shrink-0">
    <img class="size-12" src="/img/logo.svg" alt="Logo" />
  </div>
  <div>
    <div class="text-xl font-medium text-black">ChitChat</div>
    <p class="text-slate-500">You have a new message!</p>
  </div>
</div>
```

## Spacing

Control padding, margin, and space between elements.

| Class      | Properties            |
|------------|-----------------------|
| `p-0`      | `padding: 0px`        |
| `p-1`      | `padding: 0.25rem`    |
| `p-2`      | `padding: 0.5rem`     |
| `p-4`      | `padding: 1rem`       |
| `p-6`      | `padding: 1.5rem`     |
| `p-8`      | `padding: 2rem`       |
| `px-4`     | `padding-left: 1rem; padding-right: 1rem`  |
| `py-2`     | `padding-top: 0.5rem; padding-bottom: 0.5rem` |
| `m-0`      | `margin: 0px`         |
| `m-4`      | `margin: 1rem`        |
| `mx-auto`  | `margin-left: auto; margin-right: auto`     |
| `mt-8`     | `margin-top: 2rem`    |
| `mb-4`     | `margin-bottom: 1rem` |
| `space-x-4`| `> * + * { margin-left: 1rem }` |
| `space-y-2`| `> * + * { margin-top: 0.5rem }` |
| `gap-4`    | `gap: 1rem`           |

## Flexbox & Grid

```html
<!-- Flex -->
<div class="flex items-center justify-between gap-4">
  <div>Left</div>
  <div>Right</div>
</div>

<!-- Grid -->
<div class="grid grid-cols-3 gap-6">
  <div>1</div>
  <div>2</div>
  <div>3</div>
</div>

<!-- Responsive grid -->
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
  <!-- items -->
</div>
```

| Class              | Properties                     |
|--------------------|--------------------------------|
| `flex`             | `display: flex`                |
| `inline-flex`      | `display: inline-flex`         |
| `flex-row`         | `flex-direction: row`          |
| `flex-col`         | `flex-direction: column`       |
| `items-center`     | `align-items: center`          |
| `items-start`      | `align-items: flex-start`      |
| `justify-center`   | `justify-content: center`      |
| `justify-between`  | `justify-content: space-between`|
| `grid`             | `display: grid`                |
| `grid-cols-{n}`    | `grid-template-columns: repeat(n, minmax(0, 1fr))` |

## Typography

| Class            | Properties                                |
|------------------|-------------------------------------------|
| `text-xs`        | `font-size: 0.75rem; line-height: 1rem`   |
| `text-sm`        | `font-size: 0.875rem; line-height: 1.25rem` |
| `text-base`      | `font-size: 1rem; line-height: 1.5rem`    |
| `text-lg`        | `font-size: 1.125rem; line-height: 1.75rem` |
| `text-xl`        | `font-size: 1.25rem; line-height: 1.75rem`|
| `text-2xl`       | `font-size: 1.5rem; line-height: 2rem`    |
| `font-light`     | `font-weight: 300`                        |
| `font-normal`    | `font-weight: 400`                        |
| `font-medium`    | `font-weight: 500`                        |
| `font-semibold`  | `font-weight: 600`                        |
| `font-bold`      | `font-weight: 700`                        |
| `text-left`      | `text-align: left`                        |
| `text-center`    | `text-align: center`                      |
| `text-right`     | `text-align: right`                       |
| `truncate`       | `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` |

## Colors

Tailwind includes an expertly-crafted default color palette out-of-the-box.

```html
<p class="text-slate-700">Slate text</p>
<p class="text-red-500">Red text</p>
<div class="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded">
  Info alert
</div>
<button class="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-lg">
  Save Changes
</button>
```

## Responsive Design

Every utility class in Tailwind can be applied conditionally at different breakpoints.

| Breakpoint prefix | Minimum width | CSS                         |
|-------------------|---------------|-----------------------------|
| `sm`              | 640px         | `@media (min-width: 640px)` |
| `md`              | 768px         | `@media (min-width: 768px)` |
| `lg`              | 1024px        | `@media (min-width: 1024px)`|
| `xl`              | 1280px        | `@media (min-width: 1280px)`|
| `2xl`             | 1536px        | `@media (min-width: 1536px)`|

```html
<div class="w-full md:w-1/2 lg:w-1/3">
  Responsive width
</div>
```

## Hover, Focus, and Other States

```html
<button class="bg-sky-500 hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-400 active:bg-sky-800 disabled:opacity-50 transition-colors">
  Button
</button>

<input class="border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-md px-3 py-2 placeholder:text-gray-400" placeholder="Enter email" />
```

## Dark Mode

```html
<div class="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
  Adapts to dark mode
</div>
```
