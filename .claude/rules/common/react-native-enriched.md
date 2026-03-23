---
description: React Native Enriched — native rich text editor, formatting, mentions, links, images
globs: '**/*.{ts,tsx}'
alwaysApply: false
---

# React Native Enriched (react-native-enriched)

Fully native, high-performance rich text editor. **Uncontrolled component** — state lives on the native side, interact via ref.

## Setup

```bash
npx expo install react-native-enriched
npx expo prebuild
```

**Requires:** New Architecture (Fabric), RN 0.81+

## EnrichedTextInput Component

```tsx
import { EnrichedTextInput, EnrichedTextInputInstance } from 'react-native-enriched';

const ref = useRef<EnrichedTextInputInstance>(null);

<EnrichedTextInput
  ref={ref}
  defaultValue="<b>Hello</b> world" // initial HTML content
  placeholder="Start typing..."
  autoFocus={false}
  editable={true}
  mentionIndicators={['@']}
  style={{ flex: 1, fontSize: 16 }}
  onChangeState={(e) => setStyleState(e)} // formatting state updates
  onChangeText={(text) => {}} // plain text
  onChangeHtml={({ value }) => {}} // HTML (expensive — use sparingly)
  onChangeSelection={({ start, end }) => {}}
  onStartMention={() => {}}
  onChangeMention={({ indicator, text }) => {}}
  onEndMention={() => {}}
  onLinkDetected={(link) => {}}
  onFocus={() => {}}
  onBlur={() => {}}
/>;
```

## Ref Methods (Formatting)

```tsx
// Inline styles
ref.current?.toggleBold();
ref.current?.toggleItalic();
ref.current?.toggleUnderline();
ref.current?.toggleStrikeThrough();
ref.current?.toggleInlineCode();

// Paragraph styles
ref.current?.toggleH1(); // through toggleH6()
ref.current?.toggleCodeBlock();
ref.current?.toggleBlockQuote();
ref.current?.toggleOrderedList();
ref.current?.toggleUnorderedList();
ref.current?.toggleCheckboxList();

// Content
ref.current?.setValue('<p>New HTML content</p>');
const html = ref.current?.getHTML(); // read content on-demand
ref.current?.setLink(start, end, text, url); // apply link to range
ref.current?.setMention(text, value); // finalize mention
ref.current?.setImage(uri, width, height); // insert inline image

// Focus & selection
ref.current?.focus();
ref.current?.blur();
ref.current?.setSelection(start, end);
```

## Custom Toolbar (build your own)

```tsx
function Toolbar({ styleState, editorRef }) {
  return (
    <View style={styles.toolbar}>
      <Button
        title="B"
        color={styleState?.bold.isActive ? 'blue' : 'gray'}
        disabled={styleState?.bold.isBlocking}
        onPress={() => editorRef.current?.toggleBold()}
      />
      <Button
        title="I"
        color={styleState?.italic.isActive ? 'blue' : 'gray'}
        onPress={() => editorRef.current?.toggleItalic()}
      />
      {/* ... more formatting buttons */}
    </View>
  );
}
```

`onChangeState` provides `{ isActive, isBlocking, isConflicting }` for each style.

## HtmlStyle Customization

```tsx
<EnrichedTextInput
  htmlStyle={{
    h1: { fontSize: 28, bold: true },
    blockquote: { borderColor: '#ddd', borderWidth: 3, color: '#666' },
    codeblock: { backgroundColor: '#f5f5f5', borderRadius: 8, color: '#333' },
    code: { backgroundColor: '#f0f0f0', color: '#e91e63' },
    a: { color: '#2196F3', textDecorationLine: 'underline' },
    ol: { marginLeft: 20, markerColor: '#333' },
    ul: { bulletColor: '#333', bulletSize: 6, marginLeft: 20 },
  }}
/>
```

## Key Notes

- **Uncontrolled only** — no `value` prop. Use `defaultValue` for initial content, `setValue()` to update
- **HTML serialization** — primary format. Use `getHTML()` on-demand instead of continuous `onChangeHtml`
- **No built-in toolbar** — build custom toolbar using ref methods + `onChangeState`
- **No plugin system** — formatting options are fixed
- **Single-level lists only** — no nested lists
- **No web support** yet (planned via react-native-web)
