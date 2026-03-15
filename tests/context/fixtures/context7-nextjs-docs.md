# Next.js App Router

The App Router is a new paradigm for building applications using React's latest features. It uses a file-system based router built on top of Server Components, with support for layouts, nested routing, loading states, error handling, and more.

## Getting Started

The App Router works in a new directory named `app`. The `app` directory works alongside the `pages` directory to allow for incremental adoption.

```
app/
├── layout.tsx        # Root layout (required)
├── page.tsx          # Home page (/)
├── about/
│   └── page.tsx      # About page (/about)
├── blog/
│   ├── layout.tsx    # Blog layout
│   ├── page.tsx      # Blog index (/blog)
│   └── [slug]/
│       └── page.tsx  # Blog post (/blog/:slug)
└── dashboard/
    ├── layout.tsx    # Dashboard layout
    ├── page.tsx      # Dashboard index
    ├── loading.tsx   # Loading UI
    ├── error.tsx     # Error UI
    └── settings/
        └── page.tsx  # Settings page
```

> **Good to know**: `.js`, `.jsx`, or `.tsx` file extensions can be used for special files.

## Defining Routes

### Pages

A page is UI that is **unique** to a route. You can define a page by default exporting a component from a `page.tsx` file.

```tsx
// app/page.tsx
export default function Page() {
  return <h1>Hello, Home page!</h1>;
}
```

```tsx
// app/dashboard/analytics/page.tsx
export default function AnalyticsPage() {
  return <h1>Dashboard Analytics</h1>;
}
```

### Layouts

A layout is UI that is **shared** between multiple routes. On navigation, layouts preserve state, remain interactive, and do not re-render. Layouts can also be nested.

```tsx
// app/layout.tsx
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <nav>
          <a href="/">Home</a>
          <a href="/about">About</a>
          <a href="/blog">Blog</a>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
```

The root layout is defined at the top level of the `app` directory and applies to all routes. This layout is **required** and must contain `html` and `body` tags.

### Nested Layouts

Layouts defined inside a folder (e.g., `app/dashboard/layout.tsx`) apply to specific route segments and render when those segments are active. By default, layouts in the file hierarchy are **nested**, which means they wrap child layouts via their `children` prop.

```tsx
// app/dashboard/layout.tsx
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <section>
      <aside>
        <nav>
          <a href="/dashboard">Overview</a>
          <a href="/dashboard/settings">Settings</a>
          <a href="/dashboard/analytics">Analytics</a>
        </nav>
      </aside>
      <div>{children}</div>
    </section>
  );
}
```

## Dynamic Routes

When you don't know the exact segment names ahead of time and want to create routes from dynamic data, you can use Dynamic Segments that are filled in at request time or prerendered at build time.

```tsx
// app/blog/[slug]/page.tsx
export default async function BlogPost({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <h1>Blog Post: {slug}</h1>;
}
```

### Catch-all Segments

Dynamic Segments can be extended to **catch-all** subsequent segments by adding an ellipsis inside the brackets `[...segmentName]`.

| Route                        | Example URL   | `params`                    |
| ---------------------------- | ------------- | --------------------------- |
| `app/shop/[...slug]/page.js` | `/shop/a`     | `{ slug: ['a'] }`          |
| `app/shop/[...slug]/page.js` | `/shop/a/b`   | `{ slug: ['a', 'b'] }`     |
| `app/shop/[...slug]/page.js` | `/shop/a/b/c` | `{ slug: ['a', 'b', 'c'] }`|

## Loading UI and Streaming

The special file `loading.tsx` helps you create meaningful Loading UI with React Suspense. With this convention, you can show an instant loading state from the server while the content of a route segment loads.

```tsx
// app/dashboard/loading.tsx
export default function Loading() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
      <span className="ml-3 text-lg">Loading dashboard...</span>
    </div>
  );
}
```

### Streaming with Suspense

In addition to `loading.tsx`, you can also manually create Suspense Boundaries for your own UI components. The App Router supports streaming with Suspense for both Node.js and Edge runtimes.

```tsx
import { Suspense } from 'react';
import { PostFeed, Weather } from './components';

export default function Dashboard() {
  return (
    <section>
      <Suspense fallback={<p>Loading feed...</p>}>
        <PostFeed />
      </Suspense>
      <Suspense fallback={<p>Loading weather...</p>}>
        <Weather />
      </Suspense>
    </section>
  );
}
```

## Error Handling

The `error.tsx` file convention allows you to gracefully handle unexpected runtime errors in nested routes.

```tsx
'use client'; // Error boundaries must be Client Components

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div>
      <h2>Something went wrong!</h2>
      <button onClick={() => reset()}>Try again</button>
    </div>
  );
}
```

## Server Components

By default, all components in the `app` directory are React Server Components. Server Components allow you to render components on the server and reduce the amount of JavaScript sent to the client.

```tsx
// This component runs on the server
// No "use client" directive needed
async function getData() {
  const res = await fetch('https://api.example.com/data', {
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error('Failed to fetch data');
  return res.json();
}

export default async function Page() {
  const data = await getData();
  return (
    <main>
      <h1>{data.title}</h1>
      <p>{data.description}</p>
    </main>
  );
}
```

### When to use Server vs Client Components

| What do you need to do?                                  | Server Component | Client Component |
| -------------------------------------------------------- | :--------------: | :--------------: |
| Fetch data                                               | ✅               | ⚠️              |
| Access backend resources (directly)                      | ✅               | ❌              |
| Keep sensitive information on the server                 | ✅               | ❌              |
| Add interactivity and event listeners                    | ❌               | ✅              |
| Use State and Lifecycle Effects                          | ❌               | ✅              |
| Use browser-only APIs                                    | ❌               | ✅              |
| Use custom hooks that depend on state/effects/browser    | ❌               | ✅              |

## Route Handlers

Route Handlers allow you to create custom request handlers for a given route using the Web Request and Response APIs.

```tsx
// app/api/users/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
  const users = await prisma.user.findMany();
  return NextResponse.json(users);
}

export async function POST(request: Request) {
  const body = await request.json();
  const user = await prisma.user.create({ data: body });
  return NextResponse.json(user, { status: 201 });
}
```

## Metadata

Next.js has a Metadata API that can be used to define your application metadata for improved SEO and web shareability.

```tsx
// app/layout.tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'My Application',
  description: 'Built with Next.js App Router',
  openGraph: {
    title: 'My Application',
    description: 'Built with Next.js App Router',
    url: 'https://myapp.com',
    siteName: 'My App',
    locale: 'en_US',
    type: 'website',
  },
};
```
