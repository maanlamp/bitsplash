# Markup

In BitSplash one defines a UI in an XML-ish dialect, similar to JSX:

```tsx
Game = [state, setState] ->
  <game>
    <column padding={32}>
      {state.count}
      <button onClick={_ -> setState({count: state.count + 1})}>
        +1
      </button>
    </column>
  </game>;
```

This is similar to web frameworks like React. We use the lessons learned from those frameworks and give users a powerful and elegant way to program user interfaces.

<br/>

<details>
  <summary>Table of contents</summary>

- [Markup](#markup)
  - [🧱 Elements](#-elements)
    - [📃 Attributes](#-attributes)

</details>

<br/>

## 🧱 Elements

A little about elements, their shadow DOM, their attributes and children, functions are children too.

### 📃 Attributes

What are attributes? What values are allowed? We use odd syntax for values.
