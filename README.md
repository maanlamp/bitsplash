# Bitsplash

> ⚠️ This project is currently very much WIP, don't expect any of it to be properly documented and/or functioning :)

<br/>

<details>
<summary>📚 Table of Contents</summary>

- [Bitsplash](#bitsplash)
  - [How to run](#how-to-run)
  - [🧠 Philosophy](#-philosophy)
    - [📜 Declarative UI](#-declarative-ui)
    - [🔄️ Game loop](#️-game-loop)

</details>

<br/>

## How to run

This project runs on Typescript, Vite and Yarn. To start up an interactive view of the game and UI, open a command prompt and write the following commands:

```bash
yarn # install dependencies
tsc # compile source
yarn start # starts local server and opens the app in your default browser
```

To start an interactive session for developing the underlying code, you should tell the TypeScript compiler to recompile on any changes:

```bash
tsc -w
```

<br/>
<br/>
<br/>

## 🧠 Philosophy

Games for the web are often still made in big sluggish engines such as Unity or Unreal. When you just want to make a small game leveraging the newest and fastest web tech, you don't want to use those; you use BitSplash.

<br/>

### 📜 Declarative UI

In BitSplash one defines a game's UI in an XML-ish dialect, similar to JSX:

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

[You can read more about markup in the documentation.](./src/docs/markup.md)

<br/>

### 🔄️ Game loop

> ℹ️ Todo
