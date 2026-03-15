# useEffect

`useEffect` is a React Hook that lets you synchronize a component with an external system.

```jsx
useEffect(setup, dependencies?)
```

## Reference

### `useEffect(setup, dependencies?)`

Call `useEffect` at the top level of your component to declare an Effect:

```jsx
import { useEffect } from 'react';
import { createConnection } from './chat.js';

function ChatRoom({ roomId }) {
  const [serverUrl, setServerUrl] = useState('https://localhost:1234');

  useEffect(() => {
    const connection = createConnection(serverUrl, roomId);
    connection.connect();
    return () => {
      connection.disconnect();
    };
  }, [serverUrl, roomId]);
  // ...
}
```

#### Parameters

- **`setup`**: The function with your Effect's logic. Your setup function may also optionally return a *cleanup* function. When your component is added to the DOM, React will run your setup function. After every re-render with changed dependencies, React will first run the cleanup function (if you provided it) with the old values, and then run your setup function with the new values. When your component is removed from the DOM, React will run your cleanup function.

- **optional `dependencies`**: The list of all reactive values referenced inside of the `setup` code. Reactive values include props, state, and all the variables and functions declared directly inside your component body. The list of dependencies must have a constant number of items and be written inline like `[dep1, dep2, dep3]`. React will compare each dependency with its previous value using the [`Object.is`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/is) comparison. If you omit this argument, your Effect will re-run after every re-render of the component.

#### Returns

`useEffect` returns `undefined`.

#### Caveats

- `useEffect` is a Hook, so you can only call it **at the top level of your component** or your own Hooks. You can't call it inside loops or conditions. If you need that, extract a new component and move the state into it.

- If you're **not trying to synchronize with some external system**, you probably don't need an Effect. Consider using event handlers or derived state instead.

- When Strict Mode is on, React will **run one extra development-only setup+cleanup cycle** before the first real setup. This is a stress-test that ensures your cleanup logic "mirrors" your setup logic and that it stops or undoes whatever the setup was doing.

- If some of your dependencies are objects or functions defined inside the component, there is a risk that they will **cause the Effect to re-run more often than needed**. To fix this, remove unnecessary object and function dependencies. You can also extract state updates and non-reactive logic outside of your Effect.

- If your Effect wasn't caused by an interaction (like a click), React will generally let the browser **paint the updated screen first before running your Effect**. If your Effect is doing something visual (for example, positioning a tooltip), and the delay is noticeable (for example, it flickers), replace `useEffect` with `useLayoutEffect`.

---

## Usage

### Connecting to an external system

Some components need to stay connected to the network, some browser API, or a third-party library, while they are displayed on the page. These systems aren't controlled by React, so they are called *external*.

```jsx
import { useEffect } from 'react';
import { createConnection } from './chat.js';

function ChatRoom({ roomId }) {
  const [serverUrl, setServerUrl] = useState('https://localhost:1234');

  useEffect(() => {
    const connection = createConnection(serverUrl, roomId);
    connection.connect();
    return () => connection.disconnect();
  }, [serverUrl, roomId]);

  return <h1>Welcome to the {roomId} room!</h1>;
}
```

### Fetching data with Effects

You can use an Effect to fetch data for your component. Note that if you use a framework, using your framework's data fetching mechanism will be a lot more efficient than writing Effects manually.

```jsx
import { useState, useEffect } from 'react';
import { fetchBio } from './api.js';

export default function Page() {
  const [person, setPerson] = useState('Alice');
  const [bio, setBio] = useState(null);

  useEffect(() => {
    let ignore = false;
    setBio(null);
    fetchBio(person).then(result => {
      if (!ignore) {
        setBio(result);
      }
    });
    return () => {
      ignore = true;
    };
  }, [person]);

  return (
    <>
      <select value={person} onChange={e => setPerson(e.target.value)}>
        <option value="Alice">Alice</option>
        <option value="Bob">Bob</option>
        <option value="Taylor">Taylor</option>
      </select>
      <hr />
      <p><i>{bio ?? 'Loading...'}</i></p>
    </>
  );
}
```

### Controlling a non-React widget

Sometimes you want to keep an external system synchronized to some prop or state of your component.

```jsx
useEffect(() => {
  const map = mapRef.current;
  map.setZoomLevel(zoomLevel);
}, [zoomLevel]);
```

### Specifying reactive dependencies

Notice that you can't "choose" the dependencies of your Effect. Every reactive value used by your Effect's code must be declared as a dependency. Your Effect's dependency list is determined by the surrounding code:

```jsx
function ChatRoom({ roomId }) { // This is a reactive value
  const [serverUrl, setServerUrl] = useState('https://localhost:1234'); // This is a reactive value too

  useEffect(() => {
    const connection = createConnection(serverUrl, roomId); // This Effect reads these reactive values
    connection.connect();
    return () => connection.disconnect();
  }, [serverUrl, roomId]); // So you must specify them as dependencies of your Effect
  // ...
}
```

## Common Pitfalls

### Infinite loops

If your Effect updates state that causes the component to re-render, and the re-render causes the Effect to run again, you have an infinite loop:

```jsx
// BAD: infinite loop
useEffect(() => {
  setCount(count + 1);
}, [count]);
```

### Missing cleanup

If your Effect subscribes to something, the cleanup function should unsubscribe:

```jsx
useEffect(() => {
  const handler = (e) => console.log(e);
  window.addEventListener('resize', handler);
  return () => window.removeEventListener('resize', handler);
}, []);
```

### Empty dependency array vs no dependency array

- `useEffect(() => {})` — runs after every render
- `useEffect(() => {}, [])` — runs only on mount
- `useEffect(() => {}, [a, b])` — runs on mount and when `a` or `b` change
