# Supabase Edge Functions

Edge Functions are server-side TypeScript functions, distributed globally at the edge — close to your users. They can be used for listening to webhooks, integrating with third-party services, or processing data before sending it to your client.

Edge Functions are developed using **Deno**, which offers a modern JavaScript/TypeScript runtime with built-in TypeScript support, Web Standard APIs, and a secure-by-default architecture.

## Quick Start

### Create a function

```bash
supabase functions new hello-world
```

This creates a new function at `supabase/functions/hello-world/index.ts`:

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  const { name } = await req.json();

  const data = {
    message: `Hello ${name}!`,
  };

  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
});
```

### Deploy

```bash
supabase functions deploy hello-world
```

### Invoke

```bash
curl -i --location --request POST \
  'https://<project-ref>.supabase.co/functions/v1/hello-world' \
  --header 'Authorization: Bearer <anon-key>' \
  --header 'Content-Type: application/json' \
  --data '{"name": "World"}'
```

## Auth Context

Edge Functions automatically receive the user's JWT when called from the client. You can use this to verify the user and interact with the database on their behalf.

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    {
      global: {
        headers: { Authorization: req.headers.get("Authorization")! },
      },
    }
  );

  const { data: { user } } = await supabaseClient.auth.getUser();

  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data, error } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return new Response(JSON.stringify({ user, profile: data }), {
    headers: { "Content-Type": "application/json" },
  });
});
```

## CORS Headers

When calling Edge Functions from the browser, you need to handle CORS:

```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const data = { message: "Hello from Edge Functions!" };

  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
```

## Environment Variables

Use `Deno.env.get()` to access secrets and environment variables:

```typescript
serve(async (req) => {
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4",
      messages: [{ role: "user", content: "Hello!" }],
    }),
  });

  const result = await response.json();

  return new Response(JSON.stringify(result), {
    headers: { "Content-Type": "application/json" },
  });
});
```

Set secrets via the CLI:

```bash
supabase secrets set OPENAI_API_KEY=sk-...
supabase secrets list
```

## Database Webhooks

You can trigger Edge Functions automatically when database events occur:

```typescript
serve(async (req) => {
  const payload = await req.json();
  const { type, table, record, old_record } = payload;

  console.log(`Change detected: ${type} on ${table}`);

  if (type === "INSERT" && table === "orders") {
    // Send confirmation email
    await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("SENDGRID_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: record.email }] }],
        from: { email: "noreply@example.com" },
        subject: `Order #${record.id} Confirmed`,
        content: [{ type: "text/plain", value: `Your order has been placed.` }],
      }),
    });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
```

## Local Development

```bash
supabase start
supabase functions serve hello-world --env-file .env.local
```

## Limits

- **Execution time**: 150 seconds (wall clock)
- **Memory**: 150 MB
- **Payload size**: 6 MB request body
- **Regions**: Automatically deployed to all edge regions
